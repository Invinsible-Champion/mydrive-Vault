#include "daemon/socket_server.hpp"
#include <sys/socket.h>
#include <sys/un.h>
#include <unistd.h>
#include <iostream>
using namespace std;
SocketServer::SocketServer(const string &path, function<string(const string &)> callback)
    : socketPath(path), onCommandReceived(move(callback)), isRunning(true)
{

    serverFd = socket(AF_UNIX, SOCK_STREAM, 0);

    struct sockaddr_un addr;
    memset(&addr, 0, sizeof(addr));
    addr.sun_family = AF_UNIX;
    strncpy(addr.sun_path, socketPath.c_str(), sizeof(addr.sun_path) - 1);

    unlink(socketPath.c_str());

    bind(serverFd, (struct sockaddr *)&addr, sizeof(addr));
    listen(serverFd, 5);

    listenerThread = thread(&SocketServer::listenLoop, this);
}

SocketServer::~SocketServer()
{
    isRunning = false;
    close(serverFd);
    unlink(socketPath.c_str());
    if (listenerThread.joinable())
        listenerThread.join();
}

void SocketServer::listenLoop()
{
    while (isRunning)
    {
        int clientFd = accept(serverFd, nullptr, nullptr);
        if (clientFd < 0)
            continue;

        char buffer[1024] = {0};
        int bytesRead = read(clientFd, buffer, sizeof(buffer) - 1);

        if (bytesRead > 0)
        {
            string command(buffer);
            string response = onCommandReceived(command);

            write(clientFd, response.c_str(), response.length());
        }
        close(clientFd);
    }
}