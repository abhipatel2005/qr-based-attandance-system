function updateQRCode() {
    fetch("/generate_qr")
        .then(response => response.json())
        .then(data => {
            document.getElementById("qrCode").src = data.qr_code;
        })
        .catch(error => console.error("Error fetching QR:", error));
}

// Refresh QR every 3 seconds
setInterval(updateQRCode, 5000);
updateQRCode();
