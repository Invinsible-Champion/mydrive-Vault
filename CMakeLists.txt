cmake_minimum_required(VERSION 3.16)
project(myDriveSyncEngine CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

find_package(Threads REQUIRED)

find_library(SQLITE3_LIB sqlite3 REQUIRED)
find_library(CURL_LIB curl REQUIRED)
find_library(CRYPTO_LIB crypto REQUIRED) 

include_directories(include)

add_executable(mydrived 
    src/daemon/main.cpp
    src/daemon/watcher.cpp
    src/daemon/debouncer.cpp
    src/daemon/db_manager.cpp
    src/daemon/chunker.cpp
    src/daemon/uploader.cpp
    src/daemon/socket_server.cpp
    src/shared/hash_utils.cpp
)

target_link_libraries(mydrived 
    Threads::Threads 
    ${SQLITE3_LIB} 
    ${CURL_LIB} 
    ${CRYPTO_LIB}
)

add_executable(mydrive 
    src/cli/main.cpp
)