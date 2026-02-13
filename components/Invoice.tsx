import React, { useEffect, useState } from 'react';
import { Tenant, AnalysisResult } from '../types';
import { Printer, Mail, FileImage, Download, Loader2, ZoomIn, X, Link, ImageOff, Share2, Copy } from 'lucide-react';
import { jsPDF } from 'jspdf';
import html2canvas from 'html2canvas';
import { createThumbnail } from '../services/geminiService';

interface InvoiceData {
  tenant: Tenant;
  items: {
    meterName: string;
    result: AnalysisResult;
    file: File;
    cost: number;
    isShared?: boolean;
    thumbnailUrl?: string; // New: optional thumbnail from shared link
  }[];
  totalUsage: number;
  totalCost: number;
}

interface InvoiceProps {
  invoices: InvoiceData[];
  unitPrice: number;
  isSharedView?: boolean;
}

// Updated props to include onImageClick handler
const EvidenceItem: React.FC<{ item: InvoiceData['items'][0], onImageClick: (url: string) => void }> = ({ item, onImageClick }) => {
  const [preview, setPreview] = useState<string>('');

  useEffect(() => {
    // If it's shared and has a thumbnail, use that
    if (item.isShared && item.thumbnailUrl) {
        setPreview(item.thumbnailUrl);
        return;
    }

    // Only create object URL if it's not a shared/dummy file
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
                    className={`w-full h-40 object-contain bg-black/5 rounded border border-gray-200 transition-transform group-hover:brightness-90 ${item.isShared ? 'pixelated blur-[1px]' : ''}`} 
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
                   <p className="text-[10px] leading-tight">Image not available in link</p>
               </div>
           )}
        </div>
      </div>
    </div>
  );
};

export const Invoice: React.FC<InvoiceProps> = ({ invoices, unitPrice, isSharedView }) => {
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  const [isCreatingLink, setIsCreatingLink] = useState(false);
  const [viewingImageUrl, setViewingImageUrl] = useState<string | null>(null);

  const handleDownloadPDF = async () => {
    setIsGeneratingPdf(true);
    const pdf = new jsPDF('p', 'mm', 'a4');
    
    try {
      // In Shared View, the tenant might see only one invoice
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
    } catch (error) {
      console.error("PDF Generation failed:", error);
      alert("Failed to generate PDF. Please try again.");
    } finally {
      setIsGeneratingPdf(false);
    }
  };

  const handleShareLink = async (invoice: InvoiceData) => {
      setIsCreatingLink(true);
      try {
        // 1. Process items to include tiny thumbnails if possible
        const processedItems = await Promise.all(invoice.items.map(async (item) => {
            let thumb = "";
            try {
                // Only generate thumbnail if it's an original file and not already shared
                if (!item.isShared && item.file.size > 0) {
                     thumb = await createThumbnail(item.file);
                }
            } catch (e) { console.warn("Thumb failed", e); }
            
            return {
                n: item.meterName,
                s: item.result.startReading.value,
                sd: item.result.startReading.date,
                e: item.result.endReading.value,
                ed: item.result.endReading.date,
                u: item.result.usage,
                img: thumb // Include tiny base64
            };
        }));

        // 2. Construct payload
        const payload = {
            t: invoice.tenant.name, 
            p: unitPrice,           
            i: processedItems
        };

        const jsonStr = JSON.stringify(payload);
        const encoded = encodeURIComponent(jsonStr);
        
        // 3. Construct URL
        const shareUrl = `${window.location.origin}/?share=${encoded}`;
        
        // 4. Check URL length safety (browsers support large URLs but chat apps might not)
        // If it's too huge, warn user or strip images? We'll try to send it.
        // The thumbnail function targets < 2KB per image, so 3 images ~ 6KB + JSON. Should be OK for Clipboard.
        
        // 5. Construct "Rich" Text Message for Kakao
        const dateStr = new Date().toLocaleDateString();
        const msg = `[전기요금 청구서 도착]
수신: ${invoice.tenant.name}
금액: ₩${Math.floor(invoice.totalCost * 1.1).toLocaleString()}
작성일: ${dateStr}

▼ 청구서 확인 및 PDF 다운로드
${shareUrl}`;

        await navigator.clipboard.writeText(msg);
        alert('✅ Link Copied!\n\nPaste this message directly into KakaoTalk.\n\n(Note: Includes low-res thumbnails for verification)');

      } catch (err) {
          console.error('Failed to copy: ', err);
          alert("Failed to create link.");
      } finally {
          setIsCreatingLink(false);
      }
  };

  if (invoices.length === 0) return null;

  return (
    <div className="space-y-12 print:space-y-0 print:block">
      
      {/* SHARED VIEW: Tenant Banner */}
      {isSharedView && (
          <div className="bg-blue-600 text-white p-6 rounded-xl shadow-lg mb-8 text-center animate-fade-in print:hidden">
              <h2 className="text-xl font-bold mb-2">Electricity Bill Received</h2>
              <p className="opacity-90 mb-6 text-sm">Please review the details below. You can download the official PDF.</p>
              <button 
                onClick={handleDownloadPDF}
                className="bg-white text-blue-700 hover:bg-blue-50 px-6 py-3 rounded-full font-bold shadow-md inline-flex items-center gap-2 transform active:scale-95 transition-all"
              >
                  <Download className="w-5 h-5" />
                  Download PDF Invoice
              </button>
          </div>
      )}

      {/* LANDLORD VIEW: Top Action Bar */}
      {!isSharedView && (
        <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-200 flex justify-between items-center mb-8 print:hidden relative z-40">
            <div>
            <h2 className="font-bold text-gray-800">Generated Invoices ({invoices.length})</h2>
            <p className="text-sm text-gray-500">Share links or download PDFs.</p>
            </div>
            <button 
                onClick={handleDownloadPDF}
                disabled={isGeneratingPdf}
                type="button"
                className="bg-gray-100 hover:bg-gray-200 text-gray-700 px-4 py-2 rounded-lg flex items-center gap-2 font-medium transition-colors text-sm"
            >
                {isGeneratingPdf ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                PDF
            </button>
        </div>
      )}

      {invoices.map((invoice, idx) => (
        // Added ID for html2canvas targeting
        <div 
          key={invoice.tenant.id} 
          id={`invoice-card-${idx}`}
          className="bg-white shadow-2xl rounded-none md:rounded-lg overflow-hidden print:overflow-visible max-w-[210mm] mx-auto print:shadow-none print:w-full print:max-w-none print:break-after-page mb-16 relative group"
        >
          
          {/* Action Overlay (Hover) - Hidden in Shared View & Print */}
          {!isSharedView && (
            <div 
                className="absolute top-4 right-4 flex gap-2 print:hidden opacity-0 group-hover:opacity-100 transition-opacity z-10"
                data-html2canvas-ignore="true"
            >
                <button 
                onClick={() => handleShareLink(invoice)}
                type="button"
                disabled={isCreatingLink}
                className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-full shadow-lg cursor-pointer transform hover:scale-105 transition-all flex items-center gap-2 font-bold text-sm"
                title="Copy Smart Link for KakaoTalk"
                >
                {isCreatingLink ? <Loader2 className="w-4 h-4 animate-spin" /> : <Copy className="w-4 h-4" />}
                Copy Link
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