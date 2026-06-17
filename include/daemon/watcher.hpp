#pragma once
#include <string>
#include <unordered_map>
#include <functional>
using namespace std;
class Watcher
{
private:
    int inotifyFd;
    unordered_map<int, string> watchMap;
    unordered_map<string, int> pathMap;

    function<void(const string &)> onFileModified;
    void addDirectoryRecursively(const string &path);
    std::function<void(const std::string &)> onFileDeleted;

public:
    Watcher(std::function<void(const std::string &)> onModified,
            std::function<void(const std::string &)> onDeleted);
    ~Watcher();

    void addWatch(const string &rootPath);
    void removeWatch(const string &rootPath);
    void pollEvents();
};