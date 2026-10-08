// js/native-export.js
//
// The web app saves files with a Blob + <a download> click, and generates
// PDF receipts by opening a popup window and calling window.print(). Neither
// works inside an Android WebView: <a download> on a blob: URL is unreliable
// there, window.open() for a same-app popup is not supported, and there is
// no window.print(). This module provides native-safe equivalents; on a
// regular browser NativeExport.isNative() is false and callers fall through
// to the existing web code unchanged.
const NativeExport = {
    isNative() {
        return !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
    },

    // Writes a text file to the app's cache dir, then opens the native share
    // sheet so the user can save it to Drive/Files, email it, etc. - this is
    // the standard Capacitor replacement for a browser file download.
    async saveAndShare(filename, contents, mimeType) {
        const { Filesystem, Directory } = window.CapacitorFilesystem;
        const { Share } = window.CapacitorShare;

        const isBase64 = mimeType === 'application/pdf';
        const writeResult = await Filesystem.writeFile({
            path: filename,
            data: contents,
            directory: Directory.Cache,
            encoding: isBase64 ? undefined : 'utf8'
        });

        await Share.share({
            title: filename,
            url: writeResult.uri
        });
    },

    async downloadJson(filename, data) {
        await this.saveAndShare(filename, JSON.stringify(data, null, 2), 'application/json');
    },

    // Renders the same receipt data the web version shows, as an actual PDF
    // file (jsPDF), then shares it - from the Android share sheet the user
    // can save it, email it to the tenant, or print it via any print-capable
    // app (e.g. Google Drive's print action).
    async generateReceiptPdf(payment, tenant, ownerInfo) {
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF({ unit: 'pt', format: 'a4' });

        const ownerName = (ownerInfo && ownerInfo.name) || 'Rental Manager';
        const tenantName = (tenant && tenant.name) || 'N/A';
        const monthLabel = `${monthName(payment.month)} ${payment.year}`;

        const rows = [
            ['Rent', payment.monthly_rent],
            ['Electricity', payment.electricity],
            ['Gas', payment.gas],
            ['Previous Dues', payment.previous_dues]
        ];
        (payment.custom_charges || []).forEach(c => rows.push([c.label || 'Other Charge', c.amount || 0]));

        let y = 56;
        doc.setFontSize(16).setFont(undefined, 'bold');
        doc.text(ownerName, 40, y);
        doc.setFontSize(10).setFont(undefined, 'normal').setTextColor(110);
        y += 18;
        doc.text(`Payment Receipt - ${monthLabel}`, 40, y);
        y += 14;
        doc.text(`Tenant: ${tenantName}`, 40, y);

        y += 28;
        doc.setDrawColor(230).line(40, y, 555, y);
        doc.setTextColor(30);

        rows.forEach(([label, amt]) => {
            y += 24;
            doc.setFontSize(10).setFont(undefined, 'normal');
            doc.text(String(label), 40, y);
            doc.text(formatCurrency(amt || 0), 555, y, { align: 'right' });
            doc.setDrawColor(240).line(40, y + 8, 555, y + 8);
        });

        y += 30;
        doc.setDrawColor(20).setLineWidth(1.2).line(40, y - 16, 555, y - 16);
        doc.setFontSize(11).setFont(undefined, 'bold');
        doc.text('Total', 40, y);
        doc.text(formatCurrency(payment.total_payment || 0), 555, y, { align: 'right' });

        y += 26;
        doc.setFontSize(9).setFont(undefined, 'bold').setTextColor(80);
        doc.text(String(payment.status || 'unpaid').toUpperCase(), 40, y);

        const filename = `receipt_${(tenant && tenant.name ? tenant.name.replace(/\s+/g, '_') : 'tenant')}_${payment.month}_${payment.year}.pdf`;
        const base64 = doc.output('datauristring').split(',')[1];
        await this.saveAndShare(filename, base64, 'application/pdf');
    }
};

window.NativeExport = NativeExport;
