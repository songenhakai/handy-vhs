#ifndef FREI0R_HPP
#define FREI0R_HPP

#include <stdint.h>

#define F0R_PLUGIN_MODEL_FILTER 1
#define F0R_COLOR_MODEL_RGBA8888 0

#define F0R_PARAM_BOOL 0
#define F0R_PARAM_DOUBLE 1
#define F0R_PARAM_COLOR 2

typedef struct f0r_plugin_info_ {
    const char* name;
    const char* author;
    int plugin_type;
    int color_model;
    int frei0r_version;
    int major_version;
    int minor_version;
    int num_params;
    const char* explanation;
} f0r_plugin_info_t;

typedef struct f0r_param_info_ {
    const char* name;
    int type;
    const char* explanation;
    double val;
} f0r_param_info_t;

typedef void* f0r_instance_t;
typedef void* f0r_param_t;

typedef void (*f0r_set_param_value_t)(f0r_instance_t instance, f0r_param_t param, int param_index);
typedef void (*f0r_get_param_value_t)(f0r_instance_t instance, f0r_param_t param, int param_index);

#endif