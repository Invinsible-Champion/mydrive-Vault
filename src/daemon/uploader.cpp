#include "daemon/uploader.hpp"
#include <curl/curl.h>
#include <iostream>
#include <fcntl.h>
#include <unistd.h>
#include <cstdlib>
#include <exception>

std::string Uploader::getPresignedUrl(const std::string &hash)
{
    const char *apiBase = getenv("NEXT_API_URL");
    std::string baseUrl = apiBase ? apiBase : "http://127.0.0.1:3000";
    return baseUrl + "/api/chunks/upload?hash=" + hash;
}

bool Uploader::uploadData(const std::string &url, const char *data, size_t size, const std::string &cloudPath)
{
    CURL *curl = curl_easy_init();
    if (!curl)
        return false;

    // FETCH THE NEW SECURE TOKEN
    const char *daemonToken = getenv("DAEMON_TOKEN");
    if (!daemonToken)
    {
        std::cerr << "[Uploader] FATAL: DAEMON_TOKEN not found in .env file for upload!" << std::endl;
        curl_easy_cleanup(curl);
        return false;
    }

    std::string authHeader = "Authorization: Bearer ";
    authHeader += daemonToken;
    std::string fileHeader = "X-File-Name: " + cloudPath;

    struct curl_slist *headers = NULL;
    headers = curl_slist_append(headers, "Content-Type: application/octet-stream");
    headers = curl_slist_append(headers, authHeader.c_str());
    headers = curl_slist_append(headers, fileHeader.c_str());
    headers = curl_slist_append(headers, "Expect:");

    curl_easy_setopt(curl, CURLOPT_URL, url.c_str());
    curl_easy_setopt(curl, CURLOPT_HTTPHEADER, headers);
    curl_easy_setopt(curl, CURLOPT_IPRESOLVE, CURL_IPRESOLVE_V4);
    curl_easy_setopt(curl, CURLOPT_POST, 1L);
    curl_easy_setopt(curl, CURLOPT_POSTFIELDS, data);
    curl_easy_setopt(curl, CURLOPT_POSTFIELDSIZE, (long)size);
    curl_easy_setopt(curl, CURLOPT_TIMEOUT, 15L);

    // Prevent Linux OS signals from silently killing threads
    curl_easy_setopt(curl, CURLOPT_NOSIGNAL, 1L);

    CURLcode res = curl_easy_perform(curl);
    long http_code = 0;
    curl_easy_getinfo(curl, CURLINFO_RESPONSE_CODE, &http_code);

    if (res != CURLE_OK)
    {
        std::cerr << "[Uploader] Network Failure: " << curl_easy_strerror(res) << std::endl;
    }
    else if (http_code != 200 && http_code != 201)
    {
        std::cerr << "[Uploader] Server rejected chunk. HTTP Code: " << http_code << std::endl;
    }
    else
    {
        std::cout << "[Uploader] ✓ Successfully uploaded chunk!" << std::endl;
    }

    curl_slist_free_all(headers);
    curl_easy_cleanup(curl);

    return (res == CURLE_OK && (http_code == 200 || http_code == 201));
}

bool Uploader::processChunk(const ChunkInfo &chunk, const std::string &localPath, const std::string &cloudPath)
{
    try
    {
        if (localPath.empty() || cloudPath.empty())
        {
            std::cerr << "[Uploader] FATAL: Path strings are empty or corrupted in RAM." << std::endl;
            return false;
        }

        std::string url = getPresignedUrl(chunk.hash);
        if (url.empty())
            return true;

        int fd = open(localPath.c_str(), O_RDONLY);
        if (fd < 0)
        {
            std::cerr << "[Uploader] Error: Could not open file " << localPath << std::endl;
            return false;
        }

        char *buffer = new char[chunk.length];
        ssize_t bytesRead = pread(fd, buffer, chunk.length, chunk.offset);
        close(fd);

        if (bytesRead != chunk.length)
        {
            std::cerr << "[Uploader] Error: pread failed. Expected " << chunk.length << std::endl;
            delete[] buffer;
            return false;
        }

        std::cout << "[Uploader] Transmitting chunk " << chunk.hash.substr(0, 8) << " to API..." << std::endl;

        bool success = uploadData(url, buffer, chunk.length, cloudPath);
        delete[] buffer;

        return success;
    }
    catch (const std::exception &e)
    {
        std::cerr << "[Uploader] THREAD EXCEPTION CAUGHT: " << e.what() << std::endl;
        return false;
    }
    catch (...)
    {
        std::cerr << "[Uploader] UNKNOWN FATAL ERROR CAUGHT IN THREAD." << std::endl;
        return false;
    }
}

bool Uploader::deleteFile(const std::string &cloudPath)
{
    const char *apiBase = getenv("NEXT_API_URL");
    std::string url = std::string(apiBase ? apiBase : "http://127.0.0.1:3000") + "/api/chunks/upload";

    CURL *curl = curl_easy_init();
    if (!curl)
        return false;

    // FETCH THE NEW SECURE TOKEN
    const char *daemonToken = getenv("DAEMON_TOKEN");
    if (!daemonToken)
    {
        std::cerr << "[Uploader] FATAL: DAEMON_TOKEN not found in .env file for deletion!" << std::endl;
        curl_easy_cleanup(curl);
        return false;
    }

    std::string authHeader = "Authorization: Bearer ";
    authHeader += daemonToken;
    std::string fileHeader = "X-File-Name: " + cloudPath;

    struct curl_slist *headers = NULL;
    headers = curl_slist_append(headers, authHeader.c_str());
    headers = curl_slist_append(headers, fileHeader.c_str());

    curl_easy_setopt(curl, CURLOPT_URL, url.c_str());
    curl_easy_setopt(curl, CURLOPT_HTTPHEADER, headers);

    // Set HTTP method to DELETE
    curl_easy_setopt(curl, CURLOPT_CUSTOMREQUEST, "DELETE");
    curl_easy_setopt(curl, CURLOPT_NOSIGNAL, 1L);

    std::cout << "[Uploader] Requesting cloud deletion for: " << cloudPath << std::endl;

    CURLcode res = curl_easy_perform(curl);
    long http_code = 0;
    curl_easy_getinfo(curl, CURLINFO_RESPONSE_CODE, &http_code);

    if (res != CURLE_OK)
    {
        std::cerr << "[Uploader] Deletion Network Failure: " << curl_easy_strerror(res) << std::endl;
    }
    else if (http_code != 200)
    {
        std::cerr << "[Uploader] Cloud rejected deletion. HTTP Code: " << http_code << std::endl;
    }
    else
    {
        std::cout << "[Uploader] ✓ Cloud deletion successful." << std::endl;
    }

    curl_slist_free_all(headers);
    curl_easy_cleanup(curl);

    return (res == CURLE_OK && http_code == 200);
}