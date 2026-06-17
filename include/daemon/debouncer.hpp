#pragma once
#include <string>
#include <unordered_map>
#include <chrono>
#include <mutex>
#include <thread>
#include <condition_variable>
#include <functional>
#include <atomic>
using namespace std;
class Debouncer
{
private:
    unordered_map<string, chrono::steady_clock::time_point> eventMap;
    mutex mtx;
    condition_variable cv;
    thread workerThread;
    atomic<bool> isRunning;

    chrono::milliseconds debounceDelay;
    function<void(const string &)> onFileSettled;
    void processLoop();

public:
    Debouncer(chrono::milliseconds delay, function<void(const string &)> callback);
    ~Debouncer();
    void pushEvent(const string &filePath);
};
