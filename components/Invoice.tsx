
import React, { useEffect, useState } from 'react';
import { Tenant, AnalysisResult } from '../types';
import { FileImage, Download, ZoomIn, X, ImageOff, Check, Loader2 } from 'lucide-react';
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';

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
  showCost: boolean;
}

// Toast Notification Component
const Toast: React.FC<{ message: string; onClose: () => void }> = ({ message, onClose }) => {
  useEffect(() => {
    const timer = setTimeout(onClose, 3000);
    return () => clearTimeout(timer);
  }, [onClose]);

  return (
    <div className="fixed bottom-8 left-1/2 transform -translate-x-1/2 bg-gray-900 text-white px-6 py-3 rounded-full shadow-xl flex items-center gap-3 animate-fade-in-up z-[9999] print:hidden">
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
    <div className="evidence-item-card bg-white border border-gray-200 rounded-lg p-6 shadow-sm mb-6 break-inside-avoid">
      <div className="mb-4 pb-4 border-b border-gray-100 flex justify-between items-center">
        <h4 className="font-bold text-gray-800 text-xl">{item.meterName || 'Meter'}</h4>
        <span className="text-sm bg-gray-100 text-gray-600 px-3 py-1.5 rounded font-mono font-bold">Usage: {item.result.usage} kWh</span>
      </div>
      <div className="grid grid-cols-1 gap-6">
        
        {/* Data Section */}
        <div className="flex justify-between border-b border-gray-100 pb-2 mb-2">
           <div className="text-left">
              <div className="text-xs text-gray-500 mb-1">Previous</div>
              <div className="font-mono text-base font-semibold">{item.result.startReading.value}</div>
              <div className="text-xs text-gray-400">{item.result.startReading.date}</div>
           </div>
          
           <div className="text-right">
              <div className="text-xs text-gray-500 mb-1">Current</div>
              <div className="font-mono text-base font-semibold text-blue-600">{item.result.endReading.value}</div>
              <div className="text-xs text-gray-400">{item.result.endReading.date}</div>
           </div>
        </div>
        
        {/* Image Section */}
        <div 
          className="w-full relative group cursor-pointer" 
          onClick={() => preview && onImageClick(preview)}
        >
           {preview ? (
               <>
                {/* 
                   ALWAYS LARGE SIZE (500px)
                   This matches the user request for "PDF Like Size" in Web View
                */}
                <img 
                    src={preview} 
                    alt="Meter Proof" 
                    className="w-full h-[500px] object-contain bg-black/5 rounded border border-gray-200 hover:brightness-95 transition-all" 
                />
                <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                    <div className="bg-black/50 text-white p-3 rounded-full backdrop-blur-sm">
                        <ZoomIn className="w-6 h-6" />
                    </div>
                </div>
               </>
           ) : (
               <div className="w-full h-[500px] bg-gray-50 rounded border border-gray-200 border-dashed flex flex-col items-center justify-center text-gray-400 p-4 text-center">
                   <ImageOff className="w-12 h-12 mb-4 opacity-50" />
                   <p className="text-sm text-gray-400">Image not provided</p>
               </div>
           )}
        </div>
      </div>
    </div>
  );
};

export const Invoice: React.FC<InvoiceProps> = ({ invoices, unitPrice, isSharedView, showCost }) => {
  const [viewingImageUrl, setViewingImageUrl] = useState<string | null>(null);
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  
  const showToast = (msg: string) => setToastMsg(msg);

  const handleDownloadPDF = async () => {
    if (isGeneratingPdf) return;
    setIsGeneratingPdf(true);
    showToast("Generating Multi-page PDF...");

    // Slight delay to ensure UI updates
    await new Promise(resolve => setTimeout(resolve, 100));

    const pdf = new jsPDF('p', 'mm', 'a4');
    const pageWidth = 210;
    const pageHeight = 297;
    const margin = 15; 
    const contentWidth = pageWidth - (margin * 2);

    try {
      for (let i = 0; i < invoices.length; i++) {
        // Add new page for each invoice (except the first one)
        if (i > 0) pdf.addPage();
        
        let cursorY = margin;

        // --- PAGE 1: MAIN INVOICE ONLY ---
        const mainEl = document.getElementById(`invoice-main-${i}`);
        if (mainEl) {
            const canvas = await html2canvas(mainEl, { 
                scale: 2, 
                useCORS: true, 
                logging: false,
                backgroundColor: '#ffffff'
            });
            const imgHeight = (canvas.height * contentWidth) / canvas.width;
            
            pdf.addImage(canvas.toDataURL('image/jpeg', 0.8), 'JPEG', margin, cursorY, contentWidth, imgHeight);
            // We explicitly STOP here for Page 1.
        }

        // --- PAGE 2 START: EVIDENCE SECTION ---
        pdf.addPage();
        cursorY = margin;

        // 1. REPEAT HEADER BANNER on Page 2 (for context)
        const bannerEl = document.getElementById(`invoice-banner-${i}`);
        if (bannerEl) {
             const canvas = await html2canvas(bannerEl, { scale: 2, backgroundColor: '#0f172a' });
             const imgHeight = (canvas.height * contentWidth) / canvas.width;
             
             pdf.addImage(canvas.toDataURL('image/jpeg', 0.8), 'JPEG', margin, cursorY, contentWidth, imgHeight);
             cursorY += imgHeight + 10;
        }

        // 2. EVIDENCE HEADER
        const evHeaderEl = document.getElementById(`evidence-header-${i}`);
        if (evHeaderEl) {
             const canvas = await html2canvas(evHeaderEl, { scale: 2, backgroundColor: '#ffffff' });
             const imgHeight = (canvas.height * contentWidth) / canvas.width;
             
             // Check space (rarely needed at top of page 2, but good practice)
             if (cursorY + imgHeight > pageHeight - margin) {
                 pdf.addPage();
                 cursorY = margin;
             }
             
             pdf.addImage(canvas.toDataURL('image/jpeg', 0.8), 'JPEG', margin, cursorY, contentWidth, imgHeight);
             cursorY += imgHeight + 5;
        }

        // 3. EVIDENCE ITEMS
        const evidenceList = document.getElementById(`evidence-list-${i}`);
        if (evidenceList) {
            // Select all individual cards
            const items = evidenceList.querySelectorAll('.evidence-item-card');
            
            for (let j = 0; j < items.length; j++) {
                const itemEl = items[j] as HTMLElement;
                
                // Capture individual item
                const canvas = await html2canvas(itemEl, { 
                    scale: 2, 
                    useCORS: true, 
                    backgroundColor: '#ffffff' 
                });
                const imgHeight = (canvas.height * contentWidth) / canvas.width;
                
                // Check if it fits on current page
                if (cursorY + imgHeight > pageHeight - margin) {
                    pdf.addPage();
                    cursorY = margin;
                }
                
                pdf.addImage(canvas.toDataURL('image/jpeg', 0.7), 'JPEG', margin, cursorY, contentWidth, imgHeight);
                cursorY += imgHeight + 5; // spacing between items
            }
        }
      }

      pdf.save(`Invoices_${new Date().toISOString().slice(0,10)}.pdf`);
      showToast("✅ PDF Downloaded Successfully");
    } catch (error) {
      console.error("PDF Generation failed:", error);
      showToast("❌ Failed to generate PDF");
    } finally {
      setIsGeneratingPdf(false);
    }
  };

  if (invoices.length === 0) return null;

  return (
    <div className="space-y-12 relative">
      
      {toastMsg && <Toast message={toastMsg} onClose={() => setToastMsg(null)} />}

      {/* PDF Generation Overlay */}
      {isGeneratingPdf && (
        <div className="fixed inset-0 z-[9999] bg-white/90 backdrop-blur-sm flex flex-col items-center justify-center">
          <Loader2 className="w-12 h-12 text-blue-600 animate-spin mb-4" />
          <h3 className="text-xl font-bold text-gray-800">Processing Pages...</h3>
          <p className="text-gray-500">Creating smart paginated PDF</p>
        </div>
      )}

      {/* SHARED VIEW: Tenant Banner */}
      {isSharedView && (
          <div className="bg-blue-600 text-white p-6 rounded-xl shadow-lg mb-8 text-center animate-fade-in print:hidden">
              <h2 className="text-xl font-bold mb-2">Electricity Bill Details</h2>
              <p className="opacity-90 mb-6 text-sm">Please review your usage below.</p>
              <button 
                type="button"
                onClick={handleDownloadPDF}
                disabled={isGeneratingPdf}
                className="bg-white text-blue-700 hover:bg-blue-50 px-6 py-3 rounded-full font-bold shadow-md inline-flex items-center gap-2 transform active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                  {isGeneratingPdf ? <Loader2 className="w-5 h-5 animate-spin"/> : <Download className="w-5 h-5" />}
                  Download PDF
              </button>
          </div>
      )}

      {/* LANDLORD VIEW: Top Action Bar */}
      {!isSharedView && (
        <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-200 flex justify-between items-center mb-8 print:hidden relative z-40">
            <div>
            <h2 className="font-bold text-gray-800">Generated Invoices ({invoices.length})</h2>
            <p className="text-sm text-gray-500">Download formatted PDFs.</p>
            </div>
            <button 
                type="button"
                onClick={handleDownloadPDF}
                disabled={isGeneratingPdf}
                className="bg-gray-100 hover:bg-gray-200 text-gray-700 px-4 py-2 rounded-lg flex items-center gap-2 font-medium transition-colors text-sm disabled:opacity-50"
            >
                {isGeneratingPdf ? <Loader2 className="w-4 h-4 animate-spin"/> : <Download className="w-4 h-4" />}
                Download All PDF
            </button>
        </div>
      )}

      {invoices.map((invoice, idx) => (
        <div 
          key={invoice.tenant.id} 
          id={`invoice-card-${idx}`}
          className="bg-white shadow-2xl rounded-none md:rounded-lg overflow-hidden max-w-[210mm] mx-auto mb-16 relative group"
        >
          {/* SECTION 1: MAIN INFO (Header + Table) - Captured Separately */}
          <div id={`invoice-main-${idx}`} className="bg-white p-0">
            {/* Invoice Header (Also ID'd for separate capture on Page 2) */}
            <div id={`invoice-banner-${idx}`} className="bg-slate-900 text-white p-8">
                <div className="flex justify-between items-start">
                <div>
                    <h1 className="text-3xl font-bold uppercase tracking-wider mb-2">Electricity Invoice</h1>
                    <p className="text-slate-400">Utility Charge Statement</p>
                </div>
                <div className="text-right">
                    <h2 className="text-2xl font-bold">{invoice.tenant.name}</h2>
                    <p className="text-sm text-slate-400 mt-1">Date: {new Date().toLocaleDateString()}</p>
                </div>
                </div>
            </div>

            {/* Body */}
            {/* INCREASED PADDING HERE: pb-24 (was pb-0) */}
            <div className="p-8 pb-24">
                <div className="grid grid-cols-2 gap-8 mb-8">
                <div>
                    <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-1">Bill To</h3>
                    <p className="text-lg font-bold text-gray-800">{invoice.tenant.name}</p>
                </div>
                {showCost && (
                  <div className="text-right">
                      <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-1">Applied Rate</h3>
                      <p className="text-gray-800 font-mono">₩ {unitPrice.toLocaleString()} / kWh</p>
                  </div>
                )}
                </div>

                <div className="overflow-hidden border border-gray-200 rounded-lg mb-8">
                <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                    <tr>
                        <th scope="col" className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Meter Name</th>
                        <th scope="col" className="px-6 py-3 text-right text-xs font-bold text-gray-500 uppercase tracking-wider">Prev Reading</th>
                        <th scope="col" className="px-6 py-3 text-right text-xs font-bold text-gray-500 uppercase tracking-wider">Curr Reading</th>
                        <th scope="col" className="px-6 py-3 text-right text-xs font-bold text-gray-500 uppercase tracking-wider">Usage (kWh)</th>
                        {showCost && <th scope="col" className="px-6 py-3 text-right text-xs font-bold text-gray-500 uppercase tracking-wider">Amount (₩)</th>}
                    </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                    {invoice.items.map((item, itemIdx) => (
                        <tr key={itemIdx}>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{item.meterName || `Meter #${itemIdx + 1}`}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 text-right font-mono">{item.result.startReading.value.toLocaleString()}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 text-right font-mono">{item.result.endReading.value.toLocaleString()}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 text-right font-bold font-mono">{item.result.usage.toLocaleString()}</td>
                        {showCost && <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 text-right font-mono">{(item.result.usage * unitPrice).toLocaleString()}</td>}
                        </tr>
                    ))}
                    </tbody>
                    <tfoot className="bg-gray-50 font-bold">
                    <tr>
                        <td colSpan={3} className="px-6 py-4 text-right text-sm text-gray-900 uppercase">Subtotal</td>
                        <td className="px-6 py-4 text-right text-sm text-gray-900 font-mono">{invoice.totalUsage.toLocaleString()}</td>
                        {showCost && <td className="px-6 py-4 text-right text-sm text-gray-900 font-mono">{invoice.totalCost.toLocaleString()}</td>}
                    </tr>
                    </tfoot>
                </table>
                </div>

                {showCost && (
                  <div className="flex justify-end">
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
                        <span className="text-2xl font-extrabold text-blue-600">₩ {Math.floor(invoice.totalCost * 1.1).toLocaleString()}</span>
                        </div>
                    </div>
                  </div>
                )}
            </div>
          </div>

          {/* SECTION 2: EVIDENCE WRAPPER */}
          <div className="p-8 pt-0">
             
            {/* 2.1 Header - Captured Separately */}
            <div id={`evidence-header-${idx}`} className="bg-white border-t-2 border-dashed border-gray-300 pt-8 mt-8 pb-8">
               <div className="border-b-2 border-black pb-4">
                  <h2 className="text-xl font-bold uppercase flex justify-between">
                    <span>Reading Evidence</span>
                    <span className="text-gray-500 font-normal normal-case text-base">{invoice.tenant.name}</span>
                  </h2>
               </div>
               <h3 className="text-sm font-bold text-gray-500 uppercase tracking-widest mt-6 flex items-center gap-2">
                <FileImage className="w-4 h-4" /> Reading Evidence
              </h3>
            </div>

            {/* 2.2 List Items - Captured Loop-wise */}
            <div id={`evidence-list-${idx}`} className="grid grid-cols-1 gap-8">
                {invoice.items.map((item, itemIdx) => (
                  <EvidenceItem 
                    key={itemIdx} 
                    item={item} 
                    onImageClick={setViewingImageUrl} 
                  />
                ))}
            </div>

            <div className="mt-12 text-center text-xs text-gray-400">
              <p>Generated by Smart Meter Analytics</p>
            </div>
          </div>
        </div>
      ))}


      {/* Image Viewer Modal */}
      {viewingImageUrl && !isGeneratingPdf && (
        <div 
          className="fixed inset-0 z-[100] bg-black/95 flex items-center justify-center p-4 animate-fade-in"
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
