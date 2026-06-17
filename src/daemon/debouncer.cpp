#include "daemon/debouncer.hpp"
#include <iostream>
using namespace std;

Debouncer::Debouncer(chrono::milliseconds delay, function<void(const string &)> callback) : debounceDelay(delay), onFileSettled(move(callback)), isRunning(true)
{
    workerThread = thread(&Debouncer::processLoop, this);
}

Debouncer::~Debouncer()
{
    isRunning = false;
    cv.notify_all();
    if (workerThread.joinable())
    {
        workerThread.join();
    }
}

void Debouncer::processLoop()
{
    while (isRunning)
    {
        unique_lock<mutex> lock(mtx);
        cv.wait_for(lock, chrono::milliseconds(500), [this]
                    { return !eventMap.empty() || !isRunning; });
        if (!isRunning)
            break;
        auto now = chrono::steady_clock::now();
        auto it = eventMap.begin();

        while (it != eventMap.end())
        {
            auto timeSinceLastEvent = chrono::duration_cast<chrono::milliseconds>(now - it->second);

            if (timeSinceLastEvent >= debounceDelay)
            {
                string settledFile = it->first;
                cout << "[Debouncer] File settled and ready for processing: " << settledFile << "\n";
                lock.unlock();
                onFileSettled(settledFile);
                lock.lock();
                it = eventMap.erase(it);
            }
            else
            {
                ++it;
            }
        }
    }
}
void Debouncer::pushEvent(const string &filePath)
{
    lock_guard<mutex> lock(mtx);

    eventMap[filePath] = chrono::steady_clock::now();

    cv.notify_one();
}