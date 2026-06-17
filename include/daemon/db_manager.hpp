#pragma once
#include <string>
#include <vector>
#include <sqlite3.h>
#include <mutex>
using namespace std;
class DBManager
{
private:
    sqlite3 *db;
    mutex dbMutex;
    void executeQuery(const string &query);
    void initializeTables();

public:
    DBManager(const string &dbPath);
    ~DBManager();
    void logFileState(const string &filePath, const string &status);
    void logChunkHash(const string &filePath, int chunkIndex, const string &hash);
    void updateChunkStatus(const string &hash, const string &status);
    vector<string> getPendingFiles();
};