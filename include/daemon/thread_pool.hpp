#pragma once
#include <vector>
#include <queue>
#include <thread>
#include <mutex>
#include <condition_variable>
#include <atomic>
#include <iostream>
#include <string>
#include <functional> // NEW: Required for callbacks

#include "daemon/chunker.hpp"
#include "daemon/uploader.hpp"
#include "daemon/db_manager.hpp"

using namespace std;

struct UploadTask
{
    ChunkInfo chunk;
    string localPath;
    string cloudPath;
};

class ThreadPool
{
private:
    vector<thread> workers;
    queue<UploadTask> taskQueue;

    mutex queueMutex;
    condition_variable condition;
    atomic<bool> stop;

    // NEW: Callback to notify the main thread that a file is done
    std::function<void(const string &)> onTaskComplete;

    void workerLoop()
    {
        while (true)
        {
            UploadTask task;
            {
                unique_lock<mutex> lock(queueMutex);
                condition.wait(lock, [this]
                               { return stop || !taskQueue.empty(); });

                if (stop && taskQueue.empty())
                    return;

                task = taskQueue.front();
                taskQueue.pop();
            }

            // 1. Capture the success status from the Uploader
            bool success = Uploader::processChunk(task.chunk, task.localPath, task.cloudPath);

            // 2. If successful, fire the callback to update SQLite!
            if (success && onTaskComplete)
            {
                onTaskComplete(task.localPath);
            }
        }
    }

public:
    // NEW: Require the callback in the constructor
    ThreadPool(size_t numThreads, std::function<void(const string &)> callback)
        : stop(false), onTaskComplete(callback)
    {
        for (size_t i = 0; i < numThreads; ++i)
        {
            workers.emplace_back(&ThreadPool::workerLoop, this);
        }
        cout << "[ThreadPool] Initialized with " << numThreads << " parallel workers.\n";
    }

    ~ThreadPool()
    {
        {
            unique_lock<mutex> lock(queueMutex);
            stop = true;
        }
        condition.notify_all();
        for (thread &worker : workers)
        {
            if (worker.joinable())
                worker.join();
        }
    }

    void enqueueChunk(const ChunkInfo &chunk, const string &localPath, const string &cloudPath)
    {
        {
            unique_lock<mutex> lock(queueMutex);
            taskQueue.push({chunk, localPath, cloudPath});
        }
        condition.notify_one();
    }
};