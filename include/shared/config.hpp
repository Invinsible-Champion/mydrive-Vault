// File: src/shared/config.hpp
#pragma once
#include <fstream>
#include <string>
#include <cstdlib>
#include <iostream>
#include <filesystem>
#include <unistd.h>
#include <limits.h>
using namespace std;
namespace fs = filesystem;
class Config
{
public:
    static void load()
    {
        string exeDir = getExecutableDir();
        string envPath = exeDir + "/.env";

        if (!fs::exists(envPath))
        {
            string homeDir = getenv("HOME");
            envPath = homeDir + "/.config/mydrive/.env";
        }

        if (!fs::exists(envPath))
        {
            cerr << "[Config] WARNING: No .env file found at " << envPath << "\n";
            return;
        }

        ifstream file(envPath);
        string line;
        while (getline(file, line))
        {
            if (line.empty() || line[0] == '#')
                continue;

            auto delimiterPos = line.find('=');
            if (delimiterPos != string::npos)
            {
                string key = line.substr(0, delimiterPos);
                string value = line.substr(delimiterPos + 1);

                if (!value.empty() && value.front() == '"' && value.back() == '"')
                {
                    value = value.substr(1, value.length() - 2);
                }
                setenv(key.c_str(), value.c_str(), 1);
            }
        }
        cout << "[Config] Successfully loaded environment variables from: " << envPath << "\n";
    }

private:
    static string getExecutableDir()
    {
        char result[PATH_MAX];
        ssize_t count = readlink("/proc/self/exe", result, PATH_MAX);
        if (count != -1)
        {
            fs::path exePath(string(result, count));
            return exePath.parent_path().string();
        }
        return ".";
    }
};