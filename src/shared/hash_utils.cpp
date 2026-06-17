#include "shared/hash_utils.hpp"
#include <openssl/evp.h>
#include <sstream>
#include <iomanip>
using namespace std;
string HashUtils::calculateSHA256(const char *data, size_t length)
{
    EVP_MD_CTX *context = EVP_MD_CTX_new();
    if (context == nullptr)
    {
        return "";
    }

    unsigned char hash[EVP_MAX_MD_SIZE];
    unsigned int lengthOfHash = 0;

    EVP_DigestInit_ex(context, EVP_sha256(), nullptr);
    EVP_DigestUpdate(context, data, length);
    EVP_DigestFinal_ex(context, hash, &lengthOfHash);

    EVP_MD_CTX_free(context);

    stringstream ss;
    for (unsigned int i = 0; i < lengthOfHash; ++i)
    {
        ss << hex << setw(2) << setfill('0') << (int)hash[i];
    }

    return ss.str();
}