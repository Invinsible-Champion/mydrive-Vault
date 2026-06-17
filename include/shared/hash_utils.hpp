#pragma once
#include <string>
#include <cstddef>
using namespace std;
class HashUtils
{
public:
    static string calculateSHA256(const char *data, size_t length);
};