#pragma once
#include <string>
#include <thread>
#include <atomic>
#include <functional>
using namespace std;
class SocketServer
{
private:
    int serverFd;
    string socketPath;
    thread listenerThread;
    atomic<bool> isRunning;
    function<string(const string &)> onCommandReceived;

    void listenLoop();

public:
    SocketServer(const string &path, function<string(const string &)> callback);
    ~SocketServer();
};