#define _USE_MATH_DEFINES
#include "frei0r.h"
#include <stdlib.h>
#include <string.h>
#include <math.h>
#include <time.h>

typedef struct {
    unsigned int width;
    unsigned int height;
    unsigned int rng_seed;
    
    double apply_jpeg;
    double jpeg_quality;
    double apply_ringing;
    double sharpen_amount;
    double tone_low;
    double tone_high;
    double vhs_resolution;
    double cutoff_y;
    double chroma_shift;
    double noise_y;
    double noise_c;
    double jitter_amp;
    double jitter_freq;
    double head_switch;
    double dropout_count;
    double apply_color_cast;
    double cast_r;
    double cast_g;
    double cast_b;
    double apply_scanlines;
    double scanline_weight;
    double apply_blur;
    double apply_noise;
    double apply_jitter;
    double apply_head_switch;
    double apply_dropouts;
} handy_vhs_t;

static double rng(handy_vhs_t* inst) {
    inst->rng_seed = inst->rng_seed * 1103515245 + 12345;
    return (double)((inst->rng_seed >> 16) & 0x7FFF) / 32768.0;
}

static void apply_color_cast(uint32_t* data, int w, int h, 
                              double cast_r, double cast_g, double cast_b) {
    for (int i = 0; i < w * h; i++) {
        uint32_t pixel = data[i];
        uint8_t r = (pixel >> 16) & 0xFF;
        uint8_t g = (pixel >> 8) & 0xFF;
        uint8_t b = pixel & 0xFF;
        uint8_t a = (pixel >> 24) & 0xFF;
        
        int new_r = (int)(r * cast_r);
        int new_g = (int)(g * cast_g);
        int new_b = (int)(b * cast_b);
        
        data[i] = (a << 24) | 
                  ((uint8_t)(new_r > 255 ? 255 : new_r) << 16) |
                  ((uint8_t)(new_g > 255 ? 255 : new_g) << 8) |
                   (uint8_t)(new_b > 255 ? 255 : new_b);
    }
}

static void apply_blur(uint32_t* data, int w, int h, double cutoff_y) {
    int radius = (int)((1.0 - cutoff_y) * 5) + 1;

    for (int y = 0; y < h; y++) {
        for (int x = 0; x < w; x++) {
            int sum_r = 0, sum_g = 0, sum_b = 0, count = 0;

            for (int dx = -radius; dx <= radius; dx++) {
                int nx = x + dx < 0 ? 0 : (x + dx >= w ? w - 1 : x + dx);
                uint32_t p = data[y * w + nx];
                sum_r += (p >> 16) & 0xFF;
                sum_g += (p >> 8) & 0xFF;
                sum_b += p & 0xFF;
                count++;
            }

            uint32_t pixel = data[y * w + x];
            uint8_t a = (pixel >> 24) & 0xFF;
            data[y * w + x] = (a << 24) | ((sum_r/count) << 16) | ((sum_g/count) << 8) | (sum_b/count);
        }
    }
}

static void apply_chroma_shift(uint32_t* data, int w, int h, int shift, handy_vhs_t* inst) {
    (void)inst;
    uint32_t* temp = (uint32_t*)malloc(w * h * sizeof(uint32_t));
    memcpy(temp, data, w * h * sizeof(uint32_t));

    for (int y = 0; y < h; y++) {
        for (int x = 0; x < w; x++) {
            int src_x = x + shift;
            if (src_x >= w) src_x = w - 1;
            if (src_x < 0) src_x = 0;
            
            uint32_t src = temp[y * w + src_x];
            uint32_t dst = data[y * w + x];
            
            uint8_t y_val = (uint8_t)(0.299 * ((dst >> 16) & 0xFF) +
                                      0.587 * ((dst >> 8) & 0xFF) +
                                      0.114 * (dst & 0xFF));
            
            int r = (int)(y_val + 1.402 * (((src >> 16) & 0xFF) - 128));
            int g = (int)(y_val - 0.3441 * (((src >> 8) & 0xFF) - 128) -
                          0.7141 * (((src >> 16) & 0xFF) - 128));
            int b = (int)(y_val + 1.772 * ((src & 0xFF) - 128));
            
            r = r < 0 ? 0 : (r > 255 ? 255 : r);
            g = g < 0 ? 0 : (g > 255 ? 255 : g);
            b = b < 0 ? 0 : (b > 255 ? 255 : b);
            
            uint8_t a = (dst >> 24) & 0xFF;
            data[y * w + x] = (a << 24) | (r << 16) | (g << 8) | b;
        }
    }
    free(temp);
}

static void apply_noise(uint32_t* data, int w, int h, 
                        double noise_y, double noise_c, handy_vhs_t* inst) {
    for (int i = 0; i < w * h; i++) {
        uint32_t pixel = data[i];
        uint8_t r = (pixel >> 16) & 0xFF;
        uint8_t g = (pixel >> 8) & 0xFF;
        uint8_t b = pixel & 0xFF;
        uint8_t a = (pixel >> 24) & 0xFF;
        
        double y = 0.299 * r + 0.587 * g + 0.114 * b;
        double cb = -0.1687 * r - 0.3313 * g + 0.5 * b + 128;
        double cr = 0.5 * r - 0.4187 * g - 0.0813 * b + 128;
        
        y += (rng(inst) - 0.5) * 2 * noise_y * 255;
        cb += (rng(inst) - 0.5) * 2 * noise_c * 100;
        cr += (rng(inst) - 0.5) * 2 * noise_c * 100;
        
        y = y < 0 ? 0 : (y > 255 ? 255 : y);
        
        int new_r = (int)(y + 1.402 * (cr - 128));
        int new_g = (int)(y - 0.3441 * (cb - 128) - 0.7141 * (cr - 128));
        int new_b = (int)(y + 1.772 * (cb - 128));
        
        new_r = new_r < 0 ? 0 : (new_r > 255 ? 255 : new_r);
        new_g = new_g < 0 ? 0 : (new_g > 255 ? 255 : new_g);
        new_b = new_b < 0 ? 0 : (new_b > 255 ? 255 : new_b);
        
        data[i] = (a << 24) | (new_r << 16) | (new_g <<8) | new_b;
    }
}

static void apply_ringing(uint32_t* data, int w, int h, double amount, handy_vhs_t* inst) {
    (void)inst;
    uint32_t* temp = (uint32_t*)malloc(w * h * sizeof(uint32_t));
    memcpy(temp, data, w * h * sizeof(uint32_t));
    
    int size = 2;
    
    for (int y = 1; y < h - 1; y++) {
        for (int x = 1; x < w - 1; x++) {
            int sum_r = 0, sum_g = 0, sum_b = 0, count = 0;
            
            for (int dy = -size; dy <= size; dy++) {
                for (int dx = -size; dx <= size; dx++) {
                    uint32_t p = temp[(y + dy) * w + (x + dx)];
                    sum_r += (p >> 16) & 0xFF;
                    sum_g += (p >>8) & 0xFF;
                    sum_b += p & 0xFF;
                    count++;
                }
            }
            
            uint32_t pixel = temp[y * w + x];
            uint8_t r = (pixel >> 16) & 0xFF;
            uint8_t g = (pixel >> 8) & 0xFF;
            uint8_t b = pixel & 0xFF;
            uint8_t a = (pixel >> 24) & 0xFF;
            
            int avg_r = sum_r / count;
            int avg_g = sum_g / count;
            int avg_b = sum_b / count;
            
            int new_r = r + (int)((r - avg_r) * amount);
            int new_g = g + (int)((g - avg_g) * amount);
            int new_b = b + (int)((b - avg_b) * amount);
            
            new_r = new_r < 0 ? 0 : (new_r > 255 ? 255 : new_r);
            new_g = new_g < 0 ? 0 : (new_g > 255 ? 255 : new_g);
            new_b = new_b < 0 ? 0 : (new_b > 255 ? 255 : new_b);
            
            data[y * w + x] = (a << 24) | (new_r << 16) | (new_g <<8) | new_b;
        }
    }
    free(temp);
}

static void apply_tone_mapping(uint32_t* data, int w, int h, double low, double high) {
    double scale = 255.0 / (high - low);
    
    for (int i = 0; i < w * h; i++) {
        uint32_t pixel = data[i];
        uint8_t r = (pixel >> 16) & 0xFF;
        uint8_t g = (pixel >> 8) & 0xFF;
        uint8_t b = pixel & 0xFF;
        uint8_t a = (pixel >> 24) & 0xFF;
        
        r = (uint8_t)((r - low) * scale);
        g = (uint8_t)((g - low) * scale);
        b = (uint8_t)((b - low) * scale);
        
        data[i] = (a << 24) | (r << 16) | (g << 8) | b;
    }
}

static void apply_jitter(uint32_t* data, int w, int h, double amp, double freq, handy_vhs_t* inst) {
    (void)inst;
    uint32_t* temp = (uint32_t*)malloc(w * h * sizeof(uint32_t));
    memcpy(temp, data, w * h * sizeof(uint32_t));
    
    for (int y = 0; y < h; y++) {
        double phase = sin(y * freq * M_PI * 2) * amp;
        int offset = (int)round(phase);
        
        for (int x = 0; x < w; x++) {
            int src_x = x + offset;
            if (src_x < 0) src_x = 0;
            if (src_x >= w) src_x = w - 1;
            data[y * w + x] = temp[y * w + src_x];
        }
    }
    free(temp);
}

static void apply_head_switch(uint32_t* data, int w, int h, int rows, handy_vhs_t* inst) {
    if (rows <= 0) return;
    
    int start_y = h - rows;
    
    for (int y = start_y; y < h; y++) {
        double progress = (double)(y - start_y) / rows;
        int pull = (int)(30.0 * progress * progress);
        double noise_intensity = 0.4 * progress * progress;
        
        for (int x = 0; x < w; x++) {
            int src_x = x - pull;
            if (src_x <0) src_x = 0;
            if (src_x >= w) src_x = w - 1;
            
            if (progress >0.5 && rng(inst) < noise_intensity) {
                double blend = 0.3 + rng(inst) * 0.4;
                uint8_t noise = (uint8_t)(rng(inst) * 255);
                uint32_t src_pixel = data[y * w + src_x];
                uint8_t r = (uint8_t)(((src_pixel >> 16) & 0xFF) * (1 - blend) + noise * blend);
                uint8_t g = (uint8_t)(((src_pixel >>8) & 0xFF) * (1 - blend) + noise * blend);
                uint8_t b = (uint8_t)((src_pixel & 0xFF) * (1 - blend) + noise * blend);
                uint8_t a = (src_pixel >> 24) & 0xFF;
                data[y * w + x] = (a << 24) | (r << 16) | (g << 8) | b;
            } else {
                data[y * w + x] = data[y * w + src_x];
            }
        }
    }
}

static void apply_dropouts(uint32_t* data, int w, int h, int count, handy_vhs_t* inst) {
    for (int i = 0; i < count; i++) {
        int y = (int)(rng(inst) * h);
        int start_x = (int)(rng(inst) * w);
        int len = (int)(rng(inst) *80) + 10;
        
        for (int dx = 0; dx < len && (start_x + dx) < w; dx++) {
            int x = start_x + dx;
            uint32_t pixel = data[y * w + x];
            uint8_t r = (pixel >> 16) & 0xFF;
            uint8_t g = (pixel >> 8) & 0xFF;
            uint8_t b = pixel & 0xFF;
            
            double brightness = (r + g + b) / 3.0;
            uint8_t dropout_val;
            
            if (rng(inst) < 0.8) {
                if (rng(inst) < 0.6) {
                    dropout_val = (uint8_t)(rng(inst) * 255);
                } else {
                    dropout_val = brightness > 128 ? 255 : 0;
                }
            } else {
                dropout_val = brightness > 128 ? 255 : (uint8_t)200;
            }
            
            double blend = 0.7 + rng(inst) * 0.3;
            double edge_fade = 1.0;
            if (dx < 5) edge_fade = dx / 5.0;
            else if (len - dx - 1 < 5) edge_fade = (len - dx - 1) / 5.0;
            blend *= edge_fade;
            
            r = (uint8_t)(r * (1 - blend) + dropout_val * blend);
            g = (uint8_t)(g * (1 - blend) + dropout_val * blend);
            b = (uint8_t)(b * (1 - blend) + dropout_val * blend);
            
            uint8_t a = (pixel >> 24) & 0xFF;
            data[y * w + x] = (a << 24) | (r << 16) | (g <<8) | b;
        }
    }
}

static void apply_scanlines(uint32_t* data, int w, int h, double weight) {
    for (int y = 1; y < h; y += 2) {
        for (int x = 0; x < w; x++) {
            uint32_t pixel = data[y * w + x];
            uint8_t r = (uint8_t)(((pixel >> 16) & 0xFF) * weight);
            uint8_t g = (uint8_t)(((pixel >>8) & 0xFF) * weight);
            uint8_t b = (uint8_t)((pixel & 0xFF) * weight);
            uint8_t a = (pixel >> 24) & 0xFF;
            data[y * w + x] = (a << 24) | (r << 16) | (g << 8) | b;
        }
    }
}

static void apply_jpeg(uint32_t* data, int w, int h, double quality, handy_vhs_t* inst) {
    double strength = (100.0 - quality) / 100.0;
    if (strength <= 0) return;
    
    int block_size = 8;
    double block_noise = strength * 30;
    
    for (int by = 0; by < h; by += block_size) {
        for (int bx = 0; bx < w; bx += block_size) {
            for (int dy = 0; dy < block_size && (by + dy) < h; dy++) {
                for (int dx = 0; dx < block_size && (bx + dx) < w; dx++) {
                    uint32_t pixel = data[(by + dy) * w + (bx + dx)];
                    uint8_t r = (pixel >> 16) & 0xFF;
                    uint8_t g = (pixel >>8) & 0xFF;
                    uint8_t b = pixel & 0xFF;
                    uint8_t a = (pixel >> 24) & 0xFF;
                    
                    r = (uint8_t)(r + (int)((rng(inst) - 0.5) * block_noise));
                    g = (uint8_t)(g + (int)((rng(inst) - 0.5) * block_noise));
                    b = (uint8_t)(b + (int)((rng(inst) - 0.5) * block_noise));
                    
                    r = r > 255 ? 255 : (r < 0 ? 0 : r);
                    g = g > 255 ? 255 : (g < 0 ? 0 : g);
                    b = b > 255 ? 255 : (b < 0 ? 0 : b);
                    
                    data[(by + dy) * w + (bx + dx)] = (a << 24) | (r << 16) | (g << 8) | b;
                }
            }
        }
    }
}

int f0r_init() {
    return 1;
}

void f0r_deinit() {
}

void f0r_get_plugin_info(f0r_plugin_info_t* info) {
    info->name = "Handy VHS";
    info->author = "Handy VHS Authors";
    info->plugin_type = F0R_PLUGIN_MODEL_FILTER;
    info->color_model = F0R_COLOR_MODEL_RGBA8888;
    info->frei0r_version = 1;
    info->major_version = 0;
    info->minor_version = 1;
    info->num_params = 18;
    info->explanation = "VHS effect filter simulating analog video degradation";
}

void f0r_get_param_info(f0r_param_info_t* info, int param_index) {
    switch (param_index) {
        case 0:
            info->name = "Apply JPEG";
            info->type = F0R_PARAM_BOOL;
            info->explanation = "Apply JPEG artifacts";
            break;
        case 1:
            info->name = "JPEG Quality";
            info->type = F0R_PARAM_DOUBLE;
            info->explanation = "JPEG quality (1-100)";
            break;
        case 2:
            info->name = "Apply Ringing";
            info->type = F0R_PARAM_BOOL;
            info->explanation = "Apply ringing effect";
            break;
        case 3:
            info->name = "Sharpen Amount";
            info->type = F0R_PARAM_DOUBLE;
            info->explanation = "Sharpen amount";
            break;
        case 4:
            info->name = "Black Crush";
            info->type = F0R_PARAM_DOUBLE;
            info->explanation = "Black crush level";
            break;
        case 5:
            info->name = "White Blowout";
            info->type = F0R_PARAM_DOUBLE;
            info->explanation = "White blowout level";
            break;
        case 6:
            info->name = "Blur";
            info->type = F0R_PARAM_DOUBLE;
            info->explanation = "Luminance blur";
            break;
        case 7:
            info->name = "Chroma Shift";
            info->type = F0R_PARAM_DOUBLE;
            info->explanation = "Chroma shift X";
            break;
        case 8:
            info->name = "Luma Noise";
            info->type = F0R_PARAM_DOUBLE;
            info->explanation = "Luminance noise";
            break;
        case 9:
            info->name = "Chroma Noise";
            info->type = F0R_PARAM_DOUBLE;
            info->explanation = "Chroma noise";
            break;
        case 10:
            info->name = "Jitter Amp";
            info->type = F0R_PARAM_DOUBLE;
            info->explanation = "Jitter amplitude";
            break;
        case 11:
            info->name = "Jitter Freq";
            info->type = F0R_PARAM_DOUBLE;
            info->explanation = "Jitter frequency";
            break;
        case 12:
            info->name = "Head Switch";
            info->type = F0R_PARAM_DOUBLE;
            info->explanation = "Head switch rows";
            break;
        case 13:
            info->name = "Dropout Count";
            info->type = F0R_PARAM_DOUBLE;
            info->explanation = "Dropout count";
            break;
        case 14:
            info->name = "Apply Color Cast";
            info->type = F0R_PARAM_BOOL;
            info->explanation = "Apply color cast";
            break;
        case 15:
            info->name = "Scanline Weight";
            info->type = F0R_PARAM_DOUBLE;
            info->explanation = "Scanline brightness";
            break;
        case 16:
            info->name = "Apply Scanlines";
            info->type = F0R_PARAM_BOOL;
            info->explanation = "Apply scanlines";
            break;
        case 17:
            info->name = "Mix";
            info->type = F0R_PARAM_DOUBLE;
            info->explanation = "Effect mix amount";
            break;
    }
}

f0r_instance_t f0r_construct(unsigned int width, unsigned int height) {
    handy_vhs_t* inst = (handy_vhs_t*)malloc(sizeof(handy_vhs_t));
    if (!inst) return NULL;
    
    inst->width = width;
    inst->height = height;
    inst->rng_seed = (unsigned int)time(NULL);
    
    inst->apply_jpeg = 1.0;
    inst->jpeg_quality = 100.0;
    inst->apply_ringing = 1.0;
    inst->sharpen_amount = 0.13;
    inst->tone_low = 17.0;
    inst->tone_high = 232.0;
    inst->vhs_resolution = 200.0;
    inst->cutoff_y = 0.73;
    inst->chroma_shift = 4.0;
    inst->noise_y = 0.016;
    inst->noise_c = 0.046;
    inst->jitter_amp = 0.5;
    inst->jitter_freq = 0.05;
    inst->head_switch = 4.0;
    inst->dropout_count = 2.0;
    inst->apply_color_cast = 1.0;
    inst->cast_r = 0.99;
    inst->cast_g = 1.07;
    inst->cast_b = 0.93;
    inst->apply_scanlines = 1.0;
    inst->scanline_weight = 0.91;
    inst->apply_blur = 1.0;
    inst->apply_noise = 1.0;
    inst->apply_jitter = 1.0;
    inst->apply_head_switch = 1.0;
    inst->apply_dropouts = 1.0;
    
    return (f0r_instance_t)inst;
}

void f0r_destruct(f0r_instance_t instance) {
    if (instance) {
        free(instance);
    }
}

void f0r_set_param_value(f0r_instance_t instance, f0r_param_t param, int param_index) {
    handy_vhs_t* inst = (handy_vhs_t*)instance;
    double val = *(double*)param;
    
    switch (param_index) {
        case 0: inst->apply_jpeg = val; break;
        case 1: inst->jpeg_quality = val * 99.0 + 1.0; break;
        case 2: inst->apply_ringing = val; break;
        case 3: inst->sharpen_amount = val * 10.0; break;
        case 4: inst->tone_low = val * 50.0; break;
        case 5: inst->tone_high = 200.0 + val * 55.0; break;
        case 6: inst->cutoff_y = val; break;
        case 7: inst->chroma_shift = val * 15.0; break;
        case 8: inst->noise_y = val * 0.1; break;
        case 9: inst->noise_c = val *0.1; break;
        case 10: inst->jitter_amp = val * 5.0; break;
        case 11: inst->jitter_freq = val * 0.2; break;
        case 12: inst->head_switch = val * 50.0; break;
        case 13: inst->dropout_count = val * 50.0; break;
        case 14: inst->apply_color_cast = val; break;
        case 15: inst->scanline_weight = 0.5 + val * 0.5; break;
        case 16: inst->apply_scanlines = val; break;
        case 17: break;
    }
}

void f0r_get_param_value(f0r_instance_t instance, f0r_param_t param, int param_index) {
    handy_vhs_t* inst = (handy_vhs_t*)instance;
    double* val = (double*)param;
    
    switch (param_index) {
        case 0: *val = inst->apply_jpeg; break;
        case 1: *val = (inst->jpeg_quality - 1.0) / 99.0; break;
        case 2: *val = inst->apply_ringing; break;
        case 3: *val = inst->sharpen_amount / 10.0; break;
        case 4: *val = inst->tone_low / 50.0; break;
        case 5: *val = (inst->tone_high - 200.0) / 55.0; break;
        case 6: *val = inst->cutoff_y; break;
        case 7: *val = inst->chroma_shift / 15.0; break;
        case 8: *val = inst->noise_y / 0.1; break;
        case 9: *val = inst->noise_c / 0.1; break;
        case 10: *val = inst->jitter_amp / 5.0; break;
        case 11: *val = inst->jitter_freq / 0.2; break;
        case 12: *val = inst->head_switch / 50.0; break;
        case 13: *val = inst->dropout_count / 50.0; break;
        case 14: *val = inst->apply_color_cast; break;
        case 15: *val = (inst->scanline_weight - 0.5) / 0.5; break;
        case 16: *val = inst->apply_scanlines; break;
        case 17: *val = 1.0; break;
    }
}

void f0r_update(f0r_instance_t instance, double time,
                const uint32_t* inframe, uint32_t* outframe) {
    (void)time;
    handy_vhs_t* inst = (handy_vhs_t*)instance;
    int w = inst->width;
    int h = inst->height;
    
    memcpy(outframe, inframe, w * h * sizeof(uint32_t));
    
    if (inst->apply_color_cast > 0.5) {
        apply_color_cast(outframe, w, h, inst->cast_r, inst->cast_g, inst->cast_b);
    }
    
    if (inst->cutoff_y < 1.0) {
        apply_blur(outframe, w, h, inst->cutoff_y);
    }
    
    if (inst->chroma_shift > 0) {
        apply_chroma_shift(outframe, w, h, (int)inst->chroma_shift, inst);
    }
    
    if (inst->noise_y > 0 || inst->noise_c > 0) {
        apply_noise(outframe, w, h, inst->noise_y, inst->noise_c, inst);
    }
    
    if (inst->apply_ringing > 0.5) {
        apply_ringing(outframe, w, h, inst->sharpen_amount, inst);
    }
    
    apply_tone_mapping(outframe, w, h, inst->tone_low, inst->tone_high);
    
    if (inst->jitter_amp > 0) {
        apply_jitter(outframe, w, h, inst->jitter_amp, inst->jitter_freq, inst);
    }
    
    if (inst->head_switch > 0) {
        apply_head_switch(outframe, w, h, (int)inst->head_switch, inst);
    }
    
    if (inst->dropout_count > 0) {
        apply_dropouts(outframe, w, h, (int)inst->dropout_count, inst);
    }
    
    if (inst->apply_scanlines > 0.5) {
        apply_scanlines(outframe, w, h, inst->scanline_weight);
    }
    
    if (inst->apply_jpeg > 0.5) {
        apply_jpeg(outframe, w, h, inst->jpeg_quality, inst);
    }
}