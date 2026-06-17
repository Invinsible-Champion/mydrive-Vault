#include <iostream>
#include <sys/socket.h>
#include <sys/un.h>
#include <unistd.h>
#include <cstring>
using namespace std;
int main(int argc, char *argv[])
{
    if (argc < 2)
    {
        cerr << "Usage:\n"
             << "  mydrive init <absolute_path>  - Start syncing a directory\n"
             << "  mydrive status                - Check daemon health\n";
        return 1;
    }

    string command = argv[1];
    string payload = "";

    if (command == "init")
    {
        if (argc < 3)
        {
            cerr << "Error: Please specify an absolute path to initialize.\n";
            return 1;
        }
        payload = "INIT:" + string(argv[2]);
    }
    else if (command == "status")
    {
        payload = "STATUS";
    }
    else
    {
        cerr << "Unknown command: " << command << "\n";
        return 1;
    }

    int sockFd = socket(AF_UNIX, SOCK_STREAM, 0);
    if (sockFd < 0)
    {
        cerr << "Failed to create socket.\n";
        return 1;
    }

    struct sockaddr_un addr;
    memset(&addr, 0, sizeof(addr));
    addr.sun_family = AF_UNIX;
    strncpy(addr.sun_path, "/tmp/mydrive.sock", sizeof(addr.sun_path) - 1);

    if (connect(sockFd, (struct sockaddr *)&addr, sizeof(addr)) < 0)
    {
        cerr << "Error: Could not connect to myDrive daemon. Is it running?\n";
        close(sockFd);
        return 1;
    }

    write(sockFd, payload.c_str(), payload.length());

    char responseBuffer[1024] = {0};
    int bytesRead = read(sockFd, responseBuffer, sizeof(responseBuffer) - 1);
    if (bytesRead > 0)
    {
        cout << responseBuffer << "\n";
    }

    close(sockFd);
    return 0;
}