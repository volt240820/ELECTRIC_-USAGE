import React, { useEffect, useState } from 'react';
import { Tenant, AnalysisResult } from '../types';
import { FileImage, Download, Loader2, ZoomIn, X, Link, ImageOff, Share2, Copy, Check, ImageIcon, BellRing, MousePointerClick } from 'lucide-react';
import { jsPDF } from 'jspdf';
import html2canvas from 'html2canvas';

interface InvoiceData {
  tenant: Tenant;
  items: {
    meterName: string;
    result: AnalysisResult;
    file: File;
    cost: number;
    isShared?: boolean;
    thumbnailUrl?: string;
  }[];
  totalUsage: number;
  totalCost: number;
}

interface InvoiceProps {
  invoices: InvoiceData[];
  unitPrice: number;
  isSharedView?: boolean;
}

// Toast Notification Component
const Toast: React.FC<{ message: string; onClose: () => void }> = ({ message, onClose }) => {
  useEffect(() => {
    const timer = setTimeout(onClose, 3000);
    return () => clearTimeout(timer);
  }, [onClose]);

  return (
    <div className="fixed bottom-8 left-1/2 transform -translate-x-1/2 bg-gray-900 text-white px-6 py-3 rounded-full shadow-xl flex items-center gap-3 animate-fade-in-up z-[9999]">
      <div className="bg-green-500 rounded-full p-1">
        <Check className="w-3 h-3 text-white" />
      </div>
      <span className="text-sm font-medium whitespace-nowrap">{message}</span>
    </div>
  );
};

const EvidenceItem: React.FC<{ item: InvoiceData['items'][0], onImageClick: (url: string) => void }> = ({ item, onImageClick }) => {
  const [preview, setPreview] = useState<string>('');

  useEffect(() => {
    if (item.isShared && item.thumbnailUrl) {
        setPreview(item.thumbnailUrl);
        return;
    }
    if (!item.isShared && item.file.size > 0) {
        const url = URL.createObjectURL(item.file);
        setPreview(url);
        return () => URL.revokeObjectURL(url);
    }
  }, [item.file, item.isShared, item.thumbnailUrl]);

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4 break-inside-avoid shadow-sm print:shadow-none print:border print:border-gray-300 print:mb-4">
      <div className="mb-3 pb-3 border-b border-gray-100 flex justify-between items-center">
        <h4 className="font-bold text-gray-800">{item.meterName || 'Meter'}</h4>
        <span className="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded font-mono">Usage: {item.result.usage} kWh</span>
      </div>
      <div className="grid grid-cols-3 gap-4">
        <div className="col-span-1">
          <div className="text-xs text-gray-500 mb-1">Previous</div>
          <div className="font-mono text-sm font-semibold">{item.result.startReading.value}</div>
          <div className="text-[10px] text-gray-400">{item.result.startReading.date.split(' ')[0]}</div>
          
          <div className="text-xs text-gray-500 mt-3 mb-1">Current</div>
          <div className="font-mono text-sm font-semibold text-blue-600">{item.result.endReading.value}</div>
          <div className="text-[10px] text-gray-400">{item.result.endReading.date.split(' ')[0]}</div>
        </div>
        
        <div className="col-span-2 relative group cursor-pointer" onClick={() => preview && onImageClick(preview)}>
           {preview ? (
               <>
                <img 
                    src={preview} 
                    alt="Meter Proof" 
                    className="w-full h-40 object-contain bg-black/5 rounded border border-gray-200 transition-transform group-hover:brightness-90" 
                />
                <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                    <div className="bg-black/50 text-white p-2 rounded-full backdrop-blur-sm">
                        <ZoomIn className="w-5 h-5" />
                    </div>
                </div>
               </>
           ) : (
               <div className="w-full h-40 bg-gray-50 rounded border border-gray-200 border-dashed flex flex-col items-center justify-center text-gray-400 p-4 text-center">
                   <ImageOff className="w-8 h-8 mb-2 opacity-50" />
                   <p className="text-[10px] leading-tight text-gray-400">Image not included in link</p>
               </div>
           )}
        </div>
      </div>
    </div>
  );
};

export const Invoice: React.FC<InvoiceProps> = ({ invoices, unitPrice, isSharedView }) => {
  const [isProcessing, setIsProcessing] = useState(false);
  const [viewingImageUrl, setViewingImageUrl] = useState<string | null>(null);
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  const showToast = (msg: string) => setToastMsg(msg);

  const handleDownloadPDF = async (e?: React.MouseEvent) => {
    if (e) e.preventDefault();
    setIsProcessing(true);
    const pdf = new jsPDF('p', 'mm', 'a4');
    
    try {
      for (let i = 0; i < invoices.length; i++) {
        const element = document.getElementById(`invoice-card-${i}`);
        if (!element) continue;

        const canvas = await html2canvas(element, {
          scale: 2, 
          useCORS: true, 
          logging: false,
          backgroundColor: '#ffffff'
        });

        const imgData = canvas.toDataURL('image/png');
        const imgWidth = 210; 
        const imgHeight = (canvas.height * imgWidth) / canvas.width;
        
        pdf.addImage(imgData, 'PNG', 0, 0, imgWidth, imgHeight);
        
        if (i < invoices.length - 1) {
          pdf.addPage();
        }
      }

      pdf.save(`Invoice_${invoices[0]?.tenant.name || 'Electricity'}.pdf`);
      showToast("PDF Downloaded!");
    } catch (error) {
      console.error("PDF Generation failed:", error);
      showToast("Failed to generate PDF");
    } finally {
      setIsProcessing(false);
    }
  };

  // 1. Generate "Notification Card" (The 'Soomgo' style card)
  const handleShareSummaryCard = async (e: React.MouseEvent, invoice: InvoiceData, index: number) => {
    e.preventDefault();
    e.stopPropagation();
    setIsProcessing(true);

    try {
      const cardElement = document.getElementById(`summary-card-template-${index}`);
      if (!cardElement) throw new Error("Card template not found");

      // Make visible for capture but keep off-screen
      cardElement.style.display = 'block';

      const canvas = await html2canvas(cardElement, {
        scale: 2,
        useCORS: true,
        backgroundColor: '#ffffff',
        logging: false
      });

      // Hide again
      cardElement.style.display = 'none';

      const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/png'));
      if (!blob) throw new Error("Image generation failed");

      // Generate Link
      const shareUrl = await generateShareUrl(invoice);

      const fileName = `Bill_Card_${invoice.tenant.name}.png`;
      const file = new File([blob], fileName, { type: 'image/png' });

      // Copy Link to Clipboard automatically
      await navigator.clipboard.writeText(shareUrl);
      
      // Native Share
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
         try {
           await navigator.share({
             files: [file],
             title: 'Utility Bill Notification',
             text: `Here is the bill for ${invoice.tenant.name}.\nLink: ${shareUrl}`
           });
           showToast("Opened Share Sheet!");
         } catch(e) { console.log('Share cancelled'); }
      } else {
        // Desktop: Download Image + Alert about link
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = fileName;
        a.click();
        URL.revokeObjectURL(url);
        
        showToast("Card Saved! Link copied to clipboard.");
      }

    } catch (error) {
      console.error("Card gen failed", error);
      showToast("Failed to create card");
    } finally {
      setIsProcessing(false);
    }
  };

  // Helper to generate the short link
  const generateShareUrl = async (invoice: InvoiceData): Promise<string> => {
     const payload = {
        t: invoice.tenant.name, 
        p: unitPrice,           
        i: invoice.items.map(item => ({
            n: item.meterName,
            s: item.result.startReading.value,
            sd: item.result.startReading.date,
            e: item.result.endReading.value,
            ed: item.result.endReading.date,
            u: item.result.usage
        }))
    };
    const encoded = encodeURIComponent(JSON.stringify(payload));
    return `${window.location.origin}/?share=${encoded}`;
  };

  // 2. Copy Link Only
  const handleCopyLink = async (e: React.MouseEvent, invoice: InvoiceData) => {
      e.preventDefault();
      e.stopPropagation();
      try {
        const shareUrl = await generateShareUrl(invoice);
        const dateStr = new Date().toLocaleDateString();
        const msg = `[Electricity Bill]\nTo: ${invoice.tenant.name}\nAmount: ₩${Math.floor(invoice.totalCost * 1.1).toLocaleString()}\n\nLink:\n${shareUrl}`;

        await navigator.clipboard.writeText(msg);
        showToast("Link Copied!");
      } catch (err) {
          showToast("Failed to copy link");
      }
  };

  if (invoices.length === 0) return null;

  return (
    <div className="space-y-12 print:space-y-0 print:block relative">
      
      {toastMsg && <Toast message={toastMsg} onClose={() => setToastMsg(null)} />}

      {/* SHARED VIEW: Tenant Banner */}
      {isSharedView && (
          <div className="bg-blue-600 text-white p-6 rounded-xl shadow-lg mb-8 text-center animate-fade-in print:hidden">
              <h2 className="text-xl font-bold mb-2">Electricity Bill Details</h2>
              <p className="opacity-90 mb-6 text-sm">Please review your usage below.</p>
              <button 
                type="button"
                onClick={handleDownloadPDF}
                className="bg-white text-blue-700 hover:bg-blue-50 px-6 py-3 rounded-full font-bold shadow-md inline-flex items-center gap-2 transform active:scale-95 transition-all"
              >
                  <Download className="w-5 h-5" />
                  Download Official PDF
              </button>
          </div>
      )}

      {/* LANDLORD VIEW: Top Action Bar */}
      {!isSharedView && (
        <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-200 flex justify-between items-center mb-8 print:hidden relative z-40">
            <div>
            <h2 className="font-bold text-gray-800">Generated Invoices ({invoices.length})</h2>
            <p className="text-sm text-gray-500">Send notification cards or download PDFs.</p>
            </div>
            <button 
                type="button"
                onClick={handleDownloadPDF}
                disabled={isProcessing}
                className="bg-gray-100 hover:bg-gray-200 text-gray-700 px-4 py-2 rounded-lg flex items-center gap-2 font-medium transition-colors text-sm"
            >
                {isProcessing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                Download All PDF
            </button>
        </div>
      )}

      {invoices.map((invoice, idx) => (
        <div 
          key={invoice.tenant.id} 
          id={`invoice-card-${idx}`}
          className="bg-white shadow-2xl rounded-none md:rounded-lg overflow-hidden print:overflow-visible max-w-[210mm] mx-auto print:shadow-none print:w-full print:max-w-none print:break-after-page mb-16 relative group"
        >
          
          {/* --- HIDDEN SUMMARY CARD TEMPLATE (For Image Generation) --- */}
          <div 
            id={`summary-card-template-${idx}`} 
            className="fixed top-0 left-0 z-[-50] bg-white p-8 w-[400px] font-sans text-left hidden"
            style={{ border: '1px solid #e5e7eb' }} // Explicit border for canvas
          >
             <div className="mb-6">
                <p className="text-gray-500 text-sm mb-1">Hello,</p>
                <h2 className="text-xl font-bold text-gray-900 mb-1">{invoice.tenant.name}</h2>
                <p className="text-gray-600 text-sm">Your electricity bill for {new Date().toLocaleDateString()} is ready.</p>
             </div>

             <div className="bg-gray-50 rounded-xl p-6 mb-6 text-center border border-gray-100">
                <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Total Amount Due</p>
                <p className="text-3xl font-extrabold text-gray-900">₩ {Math.floor(invoice.totalCost * 1.1).toLocaleString()}</p>
             </div>

             {/* The Visual Button (Not clickable in image, but gives visual cue) */}
             <div className="bg-[#6b46c1] text-white py-3.5 px-4 rounded-lg text-center font-bold text-sm shadow-sm mb-6 flex items-center justify-center gap-2">
                <MousePointerClick className="w-4 h-4" /> View Bill Details
             </div>

             <div className="pt-4 border-t border-gray-100">
                <p className="text-[10px] text-gray-400 leading-relaxed text-center">
                  This is an automated notification.<br/>
                  Please check the link provided with this card for details.
                </p>
             </div>
          </div>
          {/* -------------------------------------------------------- */}

          {/* Action Overlay (Hover) - Hidden in Shared View & Print */}
          {!isSharedView && (
            <div 
                className="absolute top-4 right-4 flex gap-2 print:hidden opacity-0 group-hover:opacity-100 transition-opacity z-10"
                data-html2canvas-ignore="true"
            >
                {/* 1. Share Notification Card (Priority) */}
                <button 
                type="button"
                onClick={(e) => handleShareSummaryCard(e, invoice, idx)}
                disabled={isProcessing}
                className="bg-[#6b46c1] hover:bg-[#553c9a] text-white px-4 py-2 rounded-full shadow-lg cursor-pointer transform hover:scale-105 transition-all flex items-center gap-2 font-bold text-sm"
                title="Create Notification Card Image"
                >
                    {isProcessing ? <Loader2 className="w-4 h-4 animate-spin" /> : <BellRing className="w-4 h-4" />}
                    Create Card
                </button>

                 {/* 2. Copy Link */}
                 <button 
                type="button"
                onClick={(e) => handleCopyLink(e, invoice)}
                disabled={isProcessing}
                className="bg-white hover:bg-gray-100 text-gray-700 px-4 py-2 rounded-full shadow-md border border-gray-200 cursor-pointer transform hover:scale-105 transition-all flex items-center gap-2 font-medium text-sm"
                title="Copy Link Only"
                >
                    <Link className="w-4 h-4" />
                    Link
                </button>
            </div>
          )}

          {/* Invoice Header */}
          <div className="bg-slate-900 text-white p-8 print:bg-white print:text-black print:border-b-2 print:border-black">
            <div className="flex justify-between items-start">
              <div>
                <h1 className="text-3xl font-bold uppercase tracking-wider mb-2">Electricity Invoice</h1>
                <p className="text-slate-400 print:text-gray-600">Utility Charge Statement</p>
              </div>
              <div className="text-right">
                <h2 className="text-2xl font-bold">{invoice.tenant.name}</h2>
                <p className="text-sm text-slate-400 mt-1 print:text-gray-600">Date: {new Date().toLocaleDateString()}</p>
              </div>
            </div>
          </div>

          {/* Invoice Body */}
          <div className="p-8 print:p-8">
            
            {/* Summary Box */}
            <div className="grid grid-cols-2 gap-8 mb-8">
              <div>
                <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-1">Bill To</h3>
                <p className="text-lg font-bold text-gray-800">{invoice.tenant.name}</p>
              </div>
              <div className="text-right">
                <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-1">Applied Rate</h3>
                <p className="text-gray-800 font-mono">₩ {unitPrice.toLocaleString()} / kWh</p>
              </div>
            </div>

            {/* Table */}
            <div className="overflow-hidden border border-gray-200 rounded-lg mb-8 print:border-black">
              <table className="min-w-full divide-y divide-gray-200 print:divide-black">
                <thead className="bg-gray-50 print:bg-gray-100">
                  <tr>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider print:text-black">Meter Name</th>
                    <th scope="col" className="px-6 py-3 text-right text-xs font-bold text-gray-500 uppercase tracking-wider print:text-black">Prev Reading</th>
                    <th scope="col" className="px-6 py-3 text-right text-xs font-bold text-gray-500 uppercase tracking-wider print:text-black">Curr Reading</th>
                    <th scope="col" className="px-6 py-3 text-right text-xs font-bold text-gray-500 uppercase tracking-wider print:text-black">Usage (kWh)</th>
                    <th scope="col" className="px-6 py-3 text-right text-xs font-bold text-gray-500 uppercase tracking-wider print:text-black">Amount (₩)</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200 print:divide-black">
                  {invoice.items.map((item, itemIdx) => (
                    <tr key={itemIdx}>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{item.meterName || `Meter #${itemIdx + 1}`}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 text-right font-mono">{item.result.startReading.value.toLocaleString()}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 text-right font-mono">{item.result.endReading.value.toLocaleString()}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 text-right font-bold font-mono">{item.result.usage.toLocaleString()}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 text-right font-mono">{(item.result.usage * unitPrice).toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-gray-50 print:bg-gray-100 font-bold">
                  <tr>
                    <td colSpan={3} className="px-6 py-4 text-right text-sm text-gray-900 uppercase">Subtotal</td>
                    <td className="px-6 py-4 text-right text-sm text-gray-900 font-mono">{invoice.totalUsage.toLocaleString()}</td>
                    <td className="px-6 py-4 text-right text-sm text-gray-900 font-mono">{invoice.totalCost.toLocaleString()}</td>
                  </tr>
                </tfoot>
              </table>
            </div>

            {/* Final Totals */}
            <div className="flex justify-end mb-12 print:mb-0">
              <div className="w-full sm:w-1/2 md:w-1/3 space-y-3">
                <div className="flex justify-between text-sm text-gray-600">
                  <span>Supply Value</span>
                  <span>₩ {invoice.totalCost.toLocaleString()}</span>
                </div>
                <div className="flex justify-between text-sm text-gray-600">
                  <span>VAT (10%)</span>
                  <span>₩ {Math.floor(invoice.totalCost * 0.1).toLocaleString()}</span>
                </div>
                <div className="border-t border-gray-300 pt-3 flex justify-between items-center">
                  <span className="text-lg font-bold text-gray-900">Total Due</span>
                  <span className="text-2xl font-extrabold text-blue-600 print:text-black">₩ {Math.floor(invoice.totalCost * 1.1).toLocaleString()}</span>
                </div>
              </div>
            </div>

            {/* Evidence Section - Forced to new page */}
            <div 
              className="border-t-2 border-dashed border-gray-300 pt-8 mt-8 print:mt-0 print:pt-12 print:border-none"
              style={{ breakBefore: 'page', pageBreakBefore: 'always' }}
            >
              
               {/* Evidence Header (Visible only in print for context) */}
               <div className="hidden print:block mb-8 border-b-2 border-black pb-4">
                  <h2 className="text-xl font-bold uppercase flex justify-between">
                    <span>Reading Evidence</span>
                    <span className="text-gray-500 font-normal normal-case text-base">{invoice.tenant.name}</span>
                  </h2>
               </div>

              <h3 className="text-sm font-bold text-gray-500 uppercase tracking-widest mb-6 flex items-center gap-2 print:hidden">
                <FileImage className="w-4 h-4" /> Reading Evidence
              </h3>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 print:grid-cols-2 print:gap-6">
                {invoice.items.map((item, idx) => (
                  <EvidenceItem key={idx} item={item} onImageClick={setViewingImageUrl} />
                ))}
              </div>
            </div>
            
            <div className="mt-12 text-center text-xs text-gray-400 print:hidden">
              <p>Generated by Smart Meter Analytics</p>
            </div>
          </div>
        </div>
      ))}


      {/* Image Viewer Modal */}
      {viewingImageUrl && (
        <div 
          className="fixed inset-0 z-[100] bg-black/95 flex items-center justify-center p-4 print:hidden animate-fade-in"
          onClick={() => setViewingImageUrl(null)}
          data-html2canvas-ignore="true"
        >
          <button 
            type="button"
            className="absolute top-6 right-6 p-2 bg-white/10 hover:bg-white/20 text-white rounded-full transition-colors cursor-pointer"
            onClick={() => setViewingImageUrl(null)}
          >
            <X className="w-6 h-6" />
          </button>
          
          <img 
            src={viewingImageUrl} 
            alt="Full size meter reading" 
            className="max-w-full max-h-[90vh] object-contain rounded-md shadow-2xl animate-zoom-in cursor-default"
            onClick={(e) => e.stopPropagation()} // Prevent clicking image from closing modal
          />
        </div>
      )}
    </div>
  );
};