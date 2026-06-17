#pragma once
#include <string>
#include <vector>
using namespace std;
struct ChunkInfo
{
    int index;
    size_t offset;
    size_t length;
    string hash;
};

class Chunker
{
private:
    static constexpr size_t CHUNK_SIZE = 4 * 1024 * 1024;

public:
    static vector<ChunkInfo> processFile(const string &filepath);
};