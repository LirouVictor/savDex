// Abre uma ROM de GBA com um save no mGBA, sem janela, aperta botões por script e tira fotos da tela (PNG).
// Serve para conferir no próprio jogo o que o savDex lê do save (cartão do treinador, Pokédex, Pokémon…).
// O save não é alterado (é carregado como temporário). ROM e saves continuam fora do git (fixtures/).
//
// Precisa do mGBA como biblioteca (Ubuntu/Debian: apt install libmgba-dev libpng-dev):
//   gcc -O2 -o gbarun tools/gbarun.c -lmgba -lpng
// Uso:
//   ./gbarun rom.gba save.sav roteiro.txt
// Roteiro, um comando por linha:
//   wait N              espera N quadros (60 = 1 segundo)
//   press TECLAS N      segura as teclas por N quadros e solta (A, B, START, SELECT, UP, DOWN, LEFT, RIGHT, L, R;
//                       várias com "+", ex.: press A+B 4)
//   shot arquivo.png    salva a tela atual (480×320, o dobro do GBA)
// Exemplo (Unbound): wait 600 / press START 4 / wait 120 / press A 4 / wait 240 / press A 4 / wait 300 /
// press START 4 / wait 60 / … até o cartão do treinador, e shot cartao.png.

#include <mgba/core/core.h>
#include <mgba/core/config.h>
#include <mgba/core/log.h>
#define USE_PNG // png-io.h só declara as funções com isto (a libmgba do Debian/Ubuntu já vem com PNG)
#include <png.h>
#include <mgba-util/png-io.h>
#include <mgba-util/vfs.h>
#include <fcntl.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

static void quiet(struct mLogger* logger, int category, enum mLogLevel level, const char* format, va_list args) {
  (void) logger; (void) category; (void) level; (void) format; (void) args;
}

static int keyBits(char* list) {
  static const char* names[] = { "A", "B", "SELECT", "START", "RIGHT", "LEFT", "UP", "DOWN", "R", "L" };
  int keys = 0;
  for (char* k = strtok(list, "+"); k; k = strtok(NULL, "+")) {
    for (int i = 0; i < 10; i++) if (!strcmp(k, names[i])) keys |= 1 << i;
  }
  return keys;
}

static void run(struct mCore* core, int keys, int frames) {
  core->setKeys(core, keys);
  for (int i = 0; i < frames; i++) core->runFrame(core);
}

static int shot(const char* path, const color_t* buf, unsigned w, unsigned h) {
  color_t* big = malloc(sizeof(color_t) * w * h * 4);
  for (unsigned y = 0; y < h * 2; y++) for (unsigned x = 0; x < w * 2; x++) big[y * w * 2 + x] = buf[(y / 2) * w + x / 2];
  struct VFile* vf = VFileOpen(path, O_CREAT | O_TRUNC | O_WRONLY);
  if (!vf) { free(big); return 0; }
  png_structp png = PNGWriteOpen(vf);
  png_infop info = PNGWriteHeader(png, w * 2, h * 2);
  int ok = PNGWritePixels(png, w * 2, h * 2, w * 2, big);
  PNGWriteClose(png, info);
  vf->close(vf);
  free(big);
  return ok;
}

int main(int argc, char** argv) {
  if (argc < 4) { fprintf(stderr, "uso: gbarun rom.gba save.sav roteiro.txt\n"); return 1; }
  static struct mLogger logger = { .log = quiet };
  mLogSetDefaultLogger(&logger);
  struct mCore* core = mCoreFind(argv[1]);
  if (!core || !core->init(core)) { fprintf(stderr, "não deu para abrir a ROM\n"); return 1; }
  mCoreInitConfig(core, NULL);
  unsigned w, h;
  core->desiredVideoDimensions(core, &w, &h);
  color_t* buf = calloc(w * h, sizeof(color_t));
  core->setVideoBuffer(core, buf, w);
  if (!mCoreLoadFile(core, argv[1])) { fprintf(stderr, "ROM inválida\n"); return 1; }
  if (!mCoreLoadSaveFile(core, argv[2], true)) { fprintf(stderr, "save inválido\n"); return 1; }
  core->reset(core);

  FILE* script = fopen(argv[3], "r");
  if (!script) { fprintf(stderr, "roteiro não encontrado\n"); return 1; }
  char cmd[32], arg[256];
  int n;
  while (fscanf(script, "%31s", cmd) == 1) {
    if (!strcmp(cmd, "wait") && fscanf(script, "%d", &n) == 1) run(core, 0, n);
    else if (!strcmp(cmd, "press") && fscanf(script, "%255s %d", arg, &n) == 2) { run(core, keyBits(arg), n); run(core, 0, 8); }
    else if (!strcmp(cmd, "shot") && fscanf(script, "%255s", arg) == 1) {
      if (!shot(arg, buf, w, h)) fprintf(stderr, "não deu para salvar %s\n", arg);
    } else { fprintf(stderr, "comando desconhecido: %s\n", cmd); return 1; }
  }
  fclose(script);
  core->deinit(core);
  free(buf);
  return 0;
}
