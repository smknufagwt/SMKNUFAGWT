/* gallery.js — UploadSystem (upload foto ke Drive) & GalleryViewer (lightbox) */
        const UploadSystem = {
            // ⚠️ GANTI password ini sesuai keinginanmu
            
            ACCESS_CODE_B64: "%%ACCESS_CODE_B64%%",
            get ACCESS_CODE() { return atob(this.ACCESS_CODE_B64); },

            selectedFile: null,

            init() {
                const dz = document.getElementById('upload-dropzone');
                const fileInput = document.getElementById('upload-file');

                fileInput.addEventListener('change', (e) => {
                    if (e.target.files && e.target.files[0]) this.setFile(e.target.files[0]);
                });

                // Drag & drop
                ['dragover', 'dragenter'].forEach(evt => {
                    dz.addEventListener(evt, (e) => {
                        e.preventDefault();
                        dz.classList.add('dragover');
                    });
                });
                ['dragleave', 'dragend', 'drop'].forEach(evt => {
                    dz.addEventListener(evt, (e) => {
                        e.preventDefault();
                        dz.classList.remove('dragover');
                    });
                });
                dz.addEventListener('drop', (e) => {
                    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
                        this.setFile(e.dataTransfer.files[0]);
                    }
                });

                // Tutup modal kalau klik area gelap
                document.getElementById('upload-modal').addEventListener('click', (e) => {
                    if (e.target.id === 'upload-modal') this.close();
                });
            },

            setFile(file) {
                if (!file.type.startsWith('image/')) {
                    this.setStatus('⚠ HANYA FILE GAMBAR DIPERBOLEHKAN', 'error');
                    return;
                }
                if (file.size > 8 * 1024 * 1024) { // 8MB limit
                    this.setStatus('⚠ UKURAN FILE MAKSIMAL 8MB', 'error');
                    return;
                }
                this.selectedFile = file;
                document.getElementById('upload-filename').innerText = `📎 ${file.name} (${(file.size/1024).toFixed(1)} KB)`;
                this.setStatus('', '');
            },

            open() {
                if (typeof AudioFX !== 'undefined') AudioFX.click();
                document.getElementById('upload-modal').classList.add('open');
                document.body.style.overflow = 'hidden';
            },

            close() {
                document.getElementById('upload-modal').classList.remove('open');
                document.body.style.overflow = '';
            },

            setStatus(msg, type) {
                const el = document.getElementById('upload-status');
                el.innerText = msg;
                el.className = type || '';
            },

            setProgress(pct) {
                const wrap = document.getElementById('upload-progress-wrap');
                const bar  = document.getElementById('upload-progress-bar');
                if (pct === null) { wrap.style.display = 'none'; bar.style.width = '0%'; return; }
                wrap.style.display = 'block';
                bar.style.width = pct + '%';
            },

            // Cache lokal browser untuk foto hasil upload (mode interlinked / lagu & warna disimpan terpisah via localStorage)
            saveToLocalCache(item) {
                try {
                    const cache = JSON.parse(localStorage.getItem('nufa_gallery_cache') || '[]');
                    cache.unshift(item); // foto terbaru tampil di atas
                    localStorage.setItem('nufa_gallery_cache', JSON.stringify(cache));
                } catch (e) {
                    console.log('Gagal simpan cache lokal:', e);
                }
            },

            getLocalCache() {
                try {
                    return JSON.parse(localStorage.getItem('nufa_gallery_cache') || '[]');
                } catch (e) {
                    return [];
                }
            },

            fileToBase64(file) {
                return new Promise((resolve, reject) => {
                    const reader = new FileReader();
                    reader.onload  = () => resolve(reader.result.split(',')[1]);
                    reader.onerror = reject;
                    reader.readAsDataURL(file);
                });
            },

            async submit() {
                const pass    = document.getElementById('upload-password').value.trim();
                const caption = document.getElementById('upload-caption').value.trim() || 'Tanpa Caption';
                const btn     = document.getElementById('upload-submit');

                if (typeof AudioFX !== 'undefined') AudioFX.click();

                if (!pass) {
                    this.setStatus('⚠ MASUKKAN KODE AKSES TERLEBIH DAHULU', 'error');
                    return;
                }
                if (pass !== this.ACCESS_CODE) {
                    this.setStatus('✕ KODE AKSES SALAH — UPLOAD DITOLAK', 'error');
                    document.getElementById('upload-password').value = '';
                    return;
                }
                if (!this.selectedFile) {
                    this.setStatus('⚠ PILIH FILE FOTO TERLEBIH DAHULU', 'error');
                    return;
                }
                if (!GALLERY_API_URL || GALLERY_API_URL.includes('PASTE_')) {
                    this.setStatus('⚠ GALLERY_API_URL BELUM DIKONFIGURASI', 'error');
                    return;
                }

                btn.disabled = true;
                this.setStatus('📡 MENGUNGGAH KE SERVER...', 'loading');
                this.setProgress(15);

                try {
                    const base64 = await this.fileToBase64(this.selectedFile);
                    this.setProgress(45);

                    const payload = {
                        action: 'upload',
                        password: pass,
                        filename: this.selectedFile.name,
                        mimeType: this.selectedFile.type,
                        caption: caption,
                        data: base64
                    };

                    this.setProgress(70);

                    const result = await gasFetchJSON(GALLERY_API_URL, {
                        method: 'POST',
                        headers: { 'Content-Type': 'text/plain;charset=utf-8' }, // hindari preflight CORS di Apps Script
                        body: JSON.stringify(payload)
                    }, 30000, 0); // upload: timeout lebih lama, no retry (hindari upload dobel)

                    this.setProgress(100);

                    if (result.status === 'ok') {
                        this.setStatus('✓ UPLOAD BERHASIL — SINKRONISASI GALERI BERLANGSUNG...', 'success');

                        // Simpan ke cache lokal browser supaya langsung tampil walau belum sinkron Drive
                        if (result.file) {
                            this.saveToLocalCache({ file: result.file, caption: caption });
                        }

                        setTimeout(() => {
                            this.resetForm();
                            this.close();
                            System.fetchGallery(); // refresh galeri dari Drive
                        }, 1200);
                    } else {
                        throw new Error(result.message || 'Server menolak permintaan');
                    }
                } catch (err) {
                    this.setStatus('✕ GAGAL: ' + err.message, 'error');
                } finally {
                    btn.disabled = false;
                    setTimeout(() => this.setProgress(null), 1500);
                }
            },

            resetForm() {
                document.getElementById('upload-password').value = '';
                document.getElementById('upload-caption').value = '';
                document.getElementById('upload-file').value = '';
                document.getElementById('upload-filename').innerText = '';
                this.selectedFile = null;
                this.setStatus('', '');
            }
        };
        document.addEventListener('DOMContentLoaded', () => UploadSystem.init());

        const GalleryViewer = {
            index: 0,
            lb: null, img: null, cap: null, ctr: null,

            init() {
                this.lb  = document.getElementById('gallery-lightbox');
                this.img = document.getElementById('lb-img');
                this.cap = document.getElementById('lb-caption');
                this.ctr = document.getElementById('lb-counter');

                // Tutup dengan klik latar belakang
                this.lb.addEventListener('click', (e) => {
                    if (e.target === this.lb) this.close();
                });

                // Navigasi keyboard
                document.addEventListener('keydown', (e) => {
                    if (!this.lb.classList.contains('open')) return;
                    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') this.next();
                    if (e.key === 'ArrowLeft'  || e.key === 'ArrowUp')   this.prev();
                    if (e.key === 'Escape') this.close();
                });
            },

            open(url, caption) {
                if (DATABASE_FOTO.length === 0) return;
                // Cari index foto yang diklik
                const idx = DATABASE_FOTO.findIndex(f => f.file === url);
                this.index = idx >= 0 ? idx : 0;
                this._show();
                this.lb.classList.add('open');
                document.body.style.overflow = 'hidden';
            },

            close() {
                this.lb.classList.remove('open');
                document.body.style.overflow = '';
                this.img.src = '';
            },

            next() {
                if (DATABASE_FOTO.length === 0) return;
                this.index = (this.index + 1) % DATABASE_FOTO.length;
                this._show();
                if(typeof AudioFX !== 'undefined') AudioFX.click();
            },

            prev() {
                if (DATABASE_FOTO.length === 0) return;
                this.index = (this.index - 1 + DATABASE_FOTO.length) % DATABASE_FOTO.length;
                this._show();
                if(typeof AudioFX !== 'undefined') AudioFX.click();
            },

            _show() {
                const item = DATABASE_FOTO[this.index];
                this.img.style.opacity = '0';
                setTimeout(() => {
                    this.img.src = item.file;
                    this.img.style.opacity = '1';
                }, 100);
                this.cap.textContent = item.caption;
                this.ctr.textContent = `[ ${this.index + 1} / ${DATABASE_FOTO.length} ]`;
            }
        };

        // Inisialisasi viewer setelah DOM siap
        document.addEventListener('DOMContentLoaded', () => GalleryViewer.init());
        //  GLOBAL LIVE CHAT — semua pengunjung (tanpa login), IP terlihat    

