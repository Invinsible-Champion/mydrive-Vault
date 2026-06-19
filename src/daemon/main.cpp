#include "shared/config.hpp"
#include "daemon/watcher.hpp"
#include "daemon/debouncer.hpp"
#include "daemon/db_manager.hpp"
#include "daemon/chunker.hpp"
#include "daemon/thread_pool.hpp"
#include "daemon/uploader.hpp"
#include "daemon/socket_server.hpp"

#include <iostream>
#include <filesystem>
#include <string>
#include <curl/curl.h>

using namespace std;
namespace fs = filesystem;
void configureDaemonAuth(const string &token)
{
    string homeDir = getenv("HOME");
    string configDir = homeDir + "/.config/mydrive";
    string envPath = configDir + "/.env";

    filesystem::create_directories(configDir);

    ofstream envFile(envPath);
    if (envFile.is_open())
    {
        envFile << "DAEMON_TOKEN=" << token << "\n";
        envFile << "NEXT_API_URL=https://mydrive-vault.vercel.app\n";
        envFile.close();
    }
    else
    {
        cerr << "[System] FATAL: Could not write to configuration directory.\n";
    }
}
void loadConfigEnvironment()
{
    string homeDir = getenv("HOME");
    string envPath = homeDir + "/.config/mydrive/.env";

    ifstream file(envPath);
    string line;

    while (getline(file, line))
    {
        if (line.empty() || line[0] == '#')
            continue;

        size_t delimiterPos = line.find("=");
        if (delimiterPos != string::npos)
        {
            string key = line.substr(0, delimiterPos);
            string value = line.substr(delimiterPos + 1);

            setenv(key.c_str(), value.c_str(), 1);
        }
    }
}
int main(int argc, char *argv[])
{
    if (argc == 3 && string(argv[1]) == "--auth")
    {
        configureDaemonAuth(argv[2]);
        return 0;
    }
    loadConfigEnvironment();
    curl_global_init(CURL_GLOBAL_ALL);

    cout << "Starting myDrive Daemon Engine...\n";
    Config::load();

    string homeDir = getenv("HOME");
    string configDir = homeDir + "/.config/mydrive";
    if (!fs::exists(configDir))
        fs::create_directories(configDir);

    string dbPath = configDir + "/sync_state.db";
    DBManager dbManager(dbPath);

    string watchDir = "";
    if (argc > 1)
    {
        watchDir = fs::absolute(argv[1]).string();
    }
    else
    {
        cerr << "[System] FATAL: No watch directory provided. Usage: ./mydrived <path_to_folder>\n";
        return 1;
    }

    ThreadPool threadPool(thread::hardware_concurrency(), [&](const string &completedFilepath)
                          { dbManager.logFileState(completedFilepath, "UPLOADED"); });

    Debouncer debouncer(chrono::milliseconds(1500), [&](const string &filepath)
                        {
       
        
        dbManager.logFileState(filepath, "PENDING"); 
                string cloudPath = fs::relative(filepath, watchDir).string();
        
        auto chunks = Chunker::processFile(filepath);
        for (const auto& chunk : chunks) {
            dbManager.logChunkHash(filepath, chunk.index, chunk.hash);
                        threadPool.enqueueChunk(chunk, filepath, cloudPath); 
        } });

    Watcher watcher(
        [&debouncer](const string &filepath)
        { debouncer.pushEvent(filepath); },

        [&](const string &filepath)
        {
            string cloudPath = fs::relative(filepath, watchDir).string();

            thread([cloudPath, &dbManager, filepath]()
                   {
                if (Uploader::deleteFile(cloudPath)) {
                    dbManager.logFileState(filepath, "DELETED"); 
                } })
                .detach();
        });

    cout << "[System] Engine attached to directory: " << watchDir << "\n";
    watcher.addWatch(watchDir);

    auto pending = dbManager.getPendingFiles();
    if (!pending.empty())
    {
        for (const auto &file : pending)
        {
            if (fs::exists(file))
            {
                debouncer.pushEvent(file);
            }
        }
    }
    else
    {
        cout << "[System] Vault is fully synced.\n";
    }

    SocketServer socketServer("/tmp/mydrive.sock", [&](const string &cmd) -> string
                              { return "ERROR: Unknown command"; });

    watcher.pollEvents();

    curl_global_cleanup();
    return 0;
}