#pragma once
#include <string>
#include "daemon/chunker.hpp"

class Uploader
{
public:
    static bool processChunk(const ChunkInfo &chunk, const std::string &localPath, const std::string &cloudPath);
    static bool deleteFile(const std::string &cloudPath);

private:
    static std::string getPresignedUrl(const std::string &hash);

    static bool uploadData(const std::string &url, const char *data, size_t size, const std::string &cloudPath);
};