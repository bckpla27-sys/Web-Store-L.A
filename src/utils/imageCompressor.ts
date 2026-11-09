/**
 * Menghasilkan SVG QR Code DANA Default (081264659643) sebagai Data URI Base64
 * Dapat diganti kapan saja oleh Owner melalui menu Pengaturan QR di Dashboard Owner.
 */
export function getDefaultDanaQrBase64(): string {
  return '/assets/aistudio/986dc51f-841d-40ae-bbda-292a1e6bc3f5_41a4a782.jpeg';
}

/**
 * Mengompres file gambar (Bukti Transfer / QR Code) menjadi Base64 ringan (< 65KB)
 * agar hemat kuota & cepat tersimpan ke Firebase Realtime Database / Cloud Database.
 */
export function compressImageToBase64(
  file: File,
  maxWidth = 680,
  maxHeight = 680,
  quality = 0.65
): Promise<{ base64: string; width: number; height: number; sizeKB: number }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Gagal membaca file gambar.'));
    reader.onload = (event) => {
      const resultStr = event.target?.result as string;
      if (!resultStr) {
        reject(new Error('File gambar kosong.'));
        return;
      }

      const img = new Image();
      img.onerror = () => reject(new Error('Format gambar tidak didukung.'));
      img.onload = () => {
        let width = img.width;
        let height = img.height;

        if (width > maxWidth || height > maxHeight) {
          const ratio = Math.min(maxWidth / width, maxHeight / height);
          width = Math.max(1, Math.round(width * ratio));
          height = Math.max(1, Math.round(height * ratio));
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve({
            base64: resultStr,
            width: img.width,
            height: img.height,
            sizeKB: Math.round((resultStr.length * 3) / 4 / 1024),
          });
          return;
        }

        ctx.fillStyle = '#121212';
        ctx.fillRect(0, 0, width, height);
        ctx.drawImage(img, 0, 0, width, height);

        let compressedBase64 = canvas.toDataURL('image/jpeg', quality);
        // Jika masih terlalu besar (> 90KB), turunkan kualitas sedikit lagi agar ringan di Firebase
        if (compressedBase64.length > 120000) {
          compressedBase64 = canvas.toDataURL('image/jpeg', 0.48);
        }

        const sizeKB = Math.max(1, Math.round((compressedBase64.length * 3) / 4 / 1024));
        resolve({
          base64: compressedBase64,
          width,
          height,
          sizeKB,
        });
      };
      img.src = resultStr;
    };
    reader.readAsDataURL(file);
  });
}
