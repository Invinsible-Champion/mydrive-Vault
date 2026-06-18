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
namespace fs = std::filesystem;
void configureDaemonAuth(const std::string &token)
{
    std::string homeDir = getenv("HOME");
    std::string configDir = homeDir + "/.config/mydrive";
    std::string envPath = configDir + "/.env";

    std::filesystem::create_directories(configDir);

    std::ofstream envFile(envPath);
    if (envFile.is_open())
    {
        envFile << "DAEMON_TOKEN=" << token << "\n";
        envFile << "NEXT_API_URL=https://mydrive-vault.vercel.app\n";
        envFile.close();
        std::cout << "[System] ✓ Authentication token saved securely to " << envPath << "\n";
        std::cout << "[System] You can now start the daemon normally using ./mydrived\n";
    }
    else
    {
        std::cerr << "[System] FATAL: Could not write to configuration directory.\n";
    }
}
void loadConfigEnvironment()
{
    // Expand the ~ to the actual home directory
    std::string homeDir = getenv("HOME");
    std::string envPath = homeDir + "/.config/mydrive/.env";

    std::ifstream file(envPath);
    std::string line;

    while (std::getline(file, line))
    {
        // Skip empty lines and comments
        if (line.empty() || line[0] == '#')
            continue;

        size_t delimiterPos = line.find("=");
        if (delimiterPos != std::string::npos)
        {
            std::string key = line.substr(0, delimiterPos);
            std::string value = line.substr(delimiterPos + 1);

            // Inject the variable directly into the C++ runtime memory
            setenv(key.c_str(), value.c_str(), 1);
        }
    }
}
int main(int argc, char *argv[])
{
    if (argc == 3 && std::string(argv[1]) == "--auth")
    {
        configureDaemonAuth(argv[2]);
        return 0; // Exit immediately after setup
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

    // 1. Capture the root watch directory FIRST so the Debouncer can use it
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
                          {
        dbManager.logFileState(completedFilepath, "UPLOADED");
        cout << "[System] Database updated: " << completedFilepath << " marked as UPLOADED." << endl; });

    // 2. Capture watchDir by reference in the lambda
    Debouncer debouncer(chrono::milliseconds(1500), [&](const string &filepath)
                        {
        cout << "[Debouncer] Locked file for processing: " << filepath << "\n";
        
        dbManager.logFileState(filepath, "PENDING"); 
        
        // 3. Do the Path Math! Subtract the root directory from the absolute file path
        string cloudPath = fs::relative(filepath, watchDir).string();
        
        auto chunks = Chunker::processFile(filepath);
        for (const auto& chunk : chunks) {
            dbManager.logChunkHash(filepath, chunk.index, chunk.hash);
            
            // 4. Pass BOTH the local OS path and the relative cloud path
            threadPool.enqueueChunk(chunk, filepath, cloudPath); 
        } });

    Watcher watcher(
        // Callback 1: Uploads
        [&debouncer](const string &filepath)
        { debouncer.pushEvent(filepath); },

        // Callback 2: Deletions
        [&](const string &filepath)
        {
            string cloudPath = fs::relative(filepath, watchDir).string();
            cout << "[System] Propagating deletion to cloud: " << cloudPath << endl;

            // Spin up a fast background thread to delete it from the cloud
            thread([cloudPath, &dbManager, filepath]()
                   {
                if (Uploader::deleteFile(cloudPath)) {
                    // Clean up the local SQLite database so it doesn't retry
                    dbManager.logFileState(filepath, "DELETED"); 
                } })
                .detach();
        });

    // 5. Attach the watcher using our validated watchDir
    cout << "[System] Engine attached to directory: " << watchDir << "\n";
    watcher.addWatch(watchDir);

    cout << "[System] Scanning database for incomplete uploads...\n";
    auto pending = dbManager.getPendingFiles();
    if (!pending.empty())
    {
        cout << "[System] Found " << pending.size() << " pending files. Resuming...\n";
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