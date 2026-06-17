#include "daemon/db_manager.hpp"
#include <iostream>
#include <vector>
using namespace std;
DBManager::DBManager(const string &dbPath)
{
    if (sqlite3_open(dbPath.c_str(), &db) != SQLITE_OK)
    {
        cerr << "[DBManager] Error opening database: " << sqlite3_errmsg(db) << "\n";
    }
    else
    {
        initializeTables();
    }
}

DBManager::~DBManager()
{
    sqlite3_close(db);
}

void DBManager::executeQuery(const string &query)
{
    char *errMsg = nullptr;
    if (sqlite3_exec(db, query.c_str(), nullptr, nullptr, &errMsg) != SQLITE_OK)
    {
        cerr << "[DBManager] SQL Error: " << errMsg << "\n";
        sqlite3_free(errMsg);
    }
}

void DBManager::initializeTables()
{
    lock_guard<mutex> lock(dbMutex);

    const string createFilesTable =
        "CREATE TABLE IF NOT EXISTS files ("
        "filepath TEXT PRIMARY KEY, "
        "status TEXT NOT NULL, "
        "last_updated DATETIME DEFAULT CURRENT_TIMESTAMP);";

    const string createChunksTable =
        "CREATE TABLE IF NOT EXISTS chunks ("
        "hash TEXT PRIMARY KEY, "
        "filepath TEXT NOT NULL, "
        "chunk_index INTEGER NOT NULL, "
        "status TEXT NOT NULL, "
        "FOREIGN KEY(filepath) REFERENCES files(filepath));";

    executeQuery(createFilesTable);
    executeQuery(createChunksTable);
}

void DBManager::logFileState(const string &filePath, const string &status)
{
    lock_guard<mutex> lock(dbMutex);

    const char *sql = "INSERT INTO files (filepath, status) VALUES (?, ?) "
                      "ON CONFLICT(filepath) DO UPDATE SET status = excluded.status, last_updated = CURRENT_TIMESTAMP;";

    sqlite3_stmt *stmt;
    if (sqlite3_prepare_v2(db, sql, -1, &stmt, nullptr) == SQLITE_OK)
    {
        sqlite3_bind_text(stmt, 1, filePath.c_str(), -1, SQLITE_STATIC);
        sqlite3_bind_text(stmt, 2, status.c_str(), -1, SQLITE_STATIC);

        sqlite3_step(stmt);
        sqlite3_finalize(stmt);
    }
}

void DBManager::logChunkHash(const string &filePath, int chunkIndex, const string &hash)
{
    lock_guard<mutex> lock(dbMutex);

    const char *sql = "INSERT INTO chunks (hash, filepath, chunk_index, status) VALUES (?, ?, ?, 'PENDING') "
                      "ON CONFLICT(hash) DO NOTHING;";

    sqlite3_stmt *stmt;
    if (sqlite3_prepare_v2(db, sql, -1, &stmt, nullptr) == SQLITE_OK)
    {
        sqlite3_bind_text(stmt, 1, hash.c_str(), -1, SQLITE_STATIC);
        sqlite3_bind_text(stmt, 2, filePath.c_str(), -1, SQLITE_STATIC);
        sqlite3_bind_int(stmt, 3, chunkIndex);

        sqlite3_step(stmt);
        sqlite3_finalize(stmt);
    }
}

void DBManager::updateChunkStatus(const string &hash, const string &status)
{
    lock_guard<mutex> lock(dbMutex);

    const char *sql = "UPDATE chunks SET status = ? WHERE hash = ?;";

    sqlite3_stmt *stmt;
    if (sqlite3_prepare_v2(db, sql, -1, &stmt, nullptr) == SQLITE_OK)
    {
        sqlite3_bind_text(stmt, 1, status.c_str(), -1, SQLITE_STATIC);
        sqlite3_bind_text(stmt, 2, hash.c_str(), -1, SQLITE_STATIC);

        sqlite3_step(stmt);
        sqlite3_finalize(stmt);
    }
}

vector<string> DBManager::getPendingFiles()
{
    lock_guard<mutex> lock(dbMutex);
    vector<string> pendingFiles;

    const char *sql = "SELECT filepath FROM files WHERE status = 'PENDING';";
    sqlite3_stmt *stmt;

    if (sqlite3_prepare_v2(db, sql, -1, &stmt, nullptr) == SQLITE_OK)
    {
        while (sqlite3_step(stmt) == SQLITE_ROW)
        {
            const char *path = reinterpret_cast<const char *>(sqlite3_column_text(stmt, 0));
            if (path)
                pendingFiles.push_back(string(path));
        }
        sqlite3_finalize(stmt);
    }
    return pendingFiles;
}