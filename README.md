# pk910 PoW Faucet Miner (Sepolia / Ephemery / Hoodi)

Bot untuk menambang (mining PoW) faucet testnet pk910 ke alamat milik sendiri.
Mining berjalan native (WebSocket + WASM PoW dari faucet), captcha sesi-awal
diselesaikan lewat headless browser singkat + jasa solver multibot, lalu
reward otomatis di-claim ke alamat tujuan.

## Faucet yang didukung

Pilih satu, dua, atau ketiganya lewat `FAUCETS` di `.env` (dipisah koma).

| Faucet   | PoW algo  | Captcha             | minClaim | maxClaim |
|----------|-----------|---------------------|----------|----------|
| sepolia  | nickminer | custom (rotasi)     | 0.05     | 2.5      |
| ephemery | argon2    | hCaptcha            | 1.0      | 500      |
| hoodi    | nickminer | custom (rotasi)     | 0.1      | 33       |

PoW params, difficulty, dan provider captcha dibaca otomatis per faucet dari
`getFaucetConfig`, jadi bot menyesuaikan sendiri.

## Yang dibutuhkan

- **Node.js ≥ 20** (`node -v` untuk cek).
- **Akun multibot** (https://multibot.cloud) + **saldo** + **API key** — dipakai
  untuk menyelesaikan captcha.
- **1–3 alamat ETH** tujuan reward (cukup alamat publik; private key TIDAK diperlukan).

---

## Cara menjalankan (step by step)

### 1. Install dependency
```bash
npm install
```

### 2. Install browser Chromium (untuk captcha)
```bash
npx playwright install chromium
```
> Di Linux/WSL mungkin perlu library sistem — lihat bagian **Troubleshooting** di bawah.

### 3. Buat file konfigurasi `.env`
```bash
cp .env.example .env
```
Lalu buka `.env` dan isi:

- `FAUCETS` — faucet yang mau dijalankan. Contoh:
  - satu: `FAUCETS=sepolia`
  - dua: `FAUCETS=sepolia,hoodi`
  - tiga: `FAUCETS=sepolia,ephemery,hoodi`
- `MULTIBOT_APIKEY` — API key dari dashboard multibot.
- `WALLET_1_ADDR` — alamat ETH tujuan reward (wajib minimal satu). Bisa tambah
  `WALLET_2_ADDR` dan `WALLET_3_ADDR`.
- `WALLET_n_PROXY` — opsional, proxy per wallet (`http://user:pass@host:port`
  atau `socks5://host:port`). Kosongkan jika tidak pakai.
- **Kapan claim** — lihat bagian [Opsi kapan claim](#opsi-kapan-claim) di bawah.

### 4. (Opsional) jalankan test
```bash
npm test
```

### 5. Jalankan bot
```bash
npm start
```
Atau pilih faucet langsung dari command line (menimpa `FAUCETS` di `.env`):
```bash
FAUCETS=sepolia,ephemery,hoodi npm start
```

Bot memproses tiap faucet × tiap wallet secara berurutan. Kalau satu kombinasi
gagal (mis. captcha), yang lain tetap lanjut. Saat selesai akan tampil
`claimHash` + link explorer.

---

## Opsi kapan claim

Bot menambang sampai saldo sesi mencapai **threshold**, baru di-claim.
Atur lewat `.env` (pilih salah satu):

| Variabel              | Arti                                                        | Contoh |
|-----------------------|-------------------------------------------------------------|--------|
| `CLAIM_THRESHOLD_WEI` | Jumlah **absolut** dalam wei (1 ETH = 1e18 wei).            | `500000000000000000` (0.5 ETH) |
| `CLAIM_PERCENT`       | **Persen dari maxClaim** faucet, `1`..`100`.                | `50` (tambang sampai 50% maxClaim) |
| (dua-duanya kosong)   | Claim begitu mencapai **minClaim** faucet (paling cepat).   | — |

Catatan:
- Kalau dua-duanya diisi, **`CLAIM_THRESHOLD_WEI` menang**.
- Threshold otomatis di-**clamp** ke rentang `[minClaim, maxClaim]` faucet —
  jadi tak mungkin minta di bawah minimum atau di atas maksimum.
- `CLAIM_PERCENT` praktis untuk multi-faucet karena skala tiap faucet beda
  (mis. `CLAIM_PERCENT=50` → sepolia ~1.25 ETH, hoodi ~16.5 ETH, ephemery ~250 ETH).

Contoh: tambang 80% dari maksimal tiap faucet:
```
CLAIM_PERCENT=80
```

---

## Troubleshooting

### Chromium gagal jalan (`error while loading shared libraries: libnspr4.so`)
Chromium butuh library sistem (`libnspr4.so`, `libnss3.so`, `libasound.so.2`, …).
Pilih salah satu:
```bash
# A. install (Debian/Ubuntu/WSL, butuh root) — paling bersih
sudo npx playwright install-deps chromium
```
```bash
# B. tanpa root: set CHROME_LIBS_PATH di .env ke folder lib hasil ekstrak, lalu `npm start` biasa
CHROME_LIBS_PATH=/path/ke/chrome-libs/usr/lib/x86_64-linux-gnu
```
```bash
# C. tanpa root, sekali jalan: prefix LD_LIBRARY_PATH
LD_LIBRARY_PATH=/path/ke/chrome-libs/usr/lib/x86_64-linux-gnu npm start
```
Browser dijalankan dengan `--no-sandbox` (wajib di WSL/container/CI).

### Captcha gagal / `multibot poll timeout`
Kecepatan solve captcha tergantung kapasitas multibot dan bisa lambat/variatif
(reCAPTCHA & hCaptcha kadang >3 menit). Bot sudah retry 3× dengan challenge baru.
Kalau tetap gagal, pastikan saldo multibot cukup, lalu coba lagi belakangan saat
solver lebih cepat.

### Lainnya
- **Rotate API key multibot** kalau pernah ke-share di chat/plaintext.
- Reward dikirim ke `WALLET_n_ADDR`; private key tidak diperlukan/disimpan.
- `ephemery` memakai argon2 (lebih berat per hash) + minClaim 1 ETH, jadi lebih lama.

## Status validasi

Alur penuh sudah terbukti live di **sepolia** (nickminer + captcha custom):
captcha → sesi → mining → verify → balance → **claim (tx Sepolia nyata)**.
`hoodi` memakai jalur yang sama (nickminer). `ephemery` (argon2 + hCaptcha):
kode + unit test lengkap (WASM argon2 menghasilkan share valid); claim live
menunggu solver captcha yang cukup cepat.
