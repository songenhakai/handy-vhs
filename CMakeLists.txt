cmake_minimum_required(VERSION 3.10)
project(heisei_vhs)

set(CMAKE_C_STANDARD 99)
set(CMAKE_C_STANDARD_REQUIRED ON)

set(CMAKE_POSITION_INDEPENDENT_CODE ON)

add_library(heisei_vhs MODULE src/heisei_vhs.c)

set_target_properties(heisei_vhs PROPERTIES
    PREFIX ""
)

if(APPLE)
    set_target_properties(heisei_vhs PROPERTIES
        SUFFIX ".dylib"
    )
elseif(UNIX)
    set_target_properties(heisei_vhs PROPERTIES
        SUFFIX ".so"
    )
elseif(WIN32)
    set_target_properties(heisei_vhs PROPERTIES
        SUFFIX ".dll"
    )
endif()

target_include_directories(heisei_vhs PRIVATE ${CMAKE_CURRENT_SOURCE_DIR}/src)