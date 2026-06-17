#include "daemon/watcher.hpp"
#include <sys/inotify.h>
#include <unistd.h>
#include <filesystem>
#include <iostream>

using namespace std;

#define EVENT_SIZE (sizeof(struct inotify_event))
#define BUF_LEN (1024 * (EVENT_SIZE + 16))

Watcher::Watcher(function<void(const string &)> onMod, function<void(const string &)> onDel)
    : onFileModified(move(onMod)), onFileDeleted(move(onDel))
{
    inotifyFd = inotify_init();
    if (inotifyFd < 0)
    {
        cerr << "[Watcher] Failed to initialize inotify instance\n";
    }
}

Watcher::~Watcher()
{
    close(inotifyFd);
}

void Watcher::addDirectoryRecursively(const string &path)
{
    if (pathMap.find(path) != pathMap.end())
        return;

    int wd = inotify_add_watch(inotifyFd, path.c_str(),
                               IN_CLOSE_WRITE | IN_CREATE | IN_DELETE | IN_MOVED_TO | IN_MOVED_FROM);
    if (wd > 0)
    {
        watchMap[wd] = path;
        pathMap[path] = wd;
    }

    for (auto &p : filesystem::directory_iterator(path))
    {
        if (p.is_directory())
        {
            addDirectoryRecursively(p.path().string());
        }
    }
}

void Watcher::addWatch(const string &rootPath)
{
    if (filesystem::exists(rootPath) && filesystem::is_directory(rootPath))
    {
        addDirectoryRecursively(rootPath);
        cout << "[Watcher] Started tracking: " << rootPath << "\n";
    }
}

void Watcher::pollEvents()
{
    char buffer[BUF_LEN];
    while (true)
    {
        int length = read(inotifyFd, buffer, BUF_LEN);
        if (length < 0)
            continue;

        int i = 0;
        while (i < length)
        {
            struct inotify_event *event = (struct inotify_event *)&buffer[i];
            if (event->len > 0)
            {
                string dirPath = watchMap[event->wd];
                string fullPath = dirPath + "/" + event->name;

                if (event->mask & IN_ISDIR)
                {
                    if ((event->mask & IN_CREATE) || (event->mask & IN_MOVED_TO))
                    {
                        std::cout << "[Watcher] New subdirectory detected. Attaching watch: " << fullPath << "\n";

                        // 1. Attach the watch to the new folder
                        addDirectoryRecursively(fullPath);

                        // 2. NEW: Manually sweep the folder for files that already exist inside it
                        try
                        {
                            for (const auto &entry : std::filesystem::recursive_directory_iterator(fullPath))
                            {
                                if (entry.is_regular_file())
                                {
                                    std::cout << "[Watcher] Sweeping pre-existing file: " << entry.path().string() << "\n";
                                    // Fire the callback manually to trigger the debouncer/uploader
                                    if (onFileModified)
                                    {
                                        onFileModified(entry.path().string());
                                    }
                                }
                            }
                        }
                        catch (const std::exception &e)
                        {
                            std::cerr << "[Watcher] Error scanning new directory: " << e.what() << "\n";
                        }
                    }
                }
                else if ((event->mask & IN_DELETE) || (event->mask & IN_MOVED_FROM))
                {
                    // Catch both terminal 'rm' and GUI 'Move to Trash'
                    std::cout << "[Watcher] Local file deletion/move detected: " << fullPath << "\n";
                    if (onFileDeleted)
                        onFileDeleted(fullPath);
                }
                else if ((event->mask & IN_CLOSE_WRITE) || (event->mask & IN_MOVED_TO))
                {
                    std::cout << "[Watcher] File ready for processing: " << fullPath << "\n";
                    if (onFileModified)
                        onFileModified(fullPath);
                }
            }
            i += EVENT_SIZE + event->len;
        }
    }
}