#include "daemon/chunker.hpp"
#include "shared/hash_utils.hpp"
#include <sys/mman.h>
#include <sys/stat.h>
#include <fcntl.h>
#include <unistd.h>
#include <iostream>
using namespace std;
vector<ChunkInfo> Chunker::processFile(const string &filepath)
{
    vector<ChunkInfo> chunks;
    int fd = open(filepath.c_str(), O_RDONLY);
    if (fd < 0)
    {
        cerr << "[Chunker] Failed to open file: " << filepath << "\n";
        return chunks;
    }
    struct stat sb;
    if (fstat(fd, &sb) < 0)
    {
        close(fd);
        return chunks;
    }
    size_t fileSize = sb.st_size;
    if (fileSize == 0)
    {
        close(fd);
        return chunks;
    }
    char *mappedMemory = static_cast<char *>(mmap(nullptr, fileSize, PROT_READ, MAP_PRIVATE, fd, 0));
    if (mappedMemory == MAP_FAILED)
    {
        cerr << "[Chunker] mmap failed for: " << filepath << "\n";
        close(fd);
        return chunks;
    }
    size_t offset = 0;
    int chunkIndex = 0;

    while (offset < fileSize)
    {
        size_t currentChunkSize = min(CHUNK_SIZE, fileSize - offset);
        const char *chunkStart = mappedMemory + offset;

        string chunkHash = HashUtils::calculateSHA256(chunkStart, currentChunkSize);

        chunks.push_back({chunkIndex, offset, currentChunkSize, chunkHash});
        offset += currentChunkSize;
        chunkIndex++;
    }
    munmap(mappedMemory, fileSize);
    close(fd);

    return chunks;
}