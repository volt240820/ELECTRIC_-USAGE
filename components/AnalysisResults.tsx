import React, { useState, useEffect, useMemo } from 'react';
import { AnalysisResult, Tenant, MeterAssignment } from '../types';
import { Calendar, Zap, FileImage, Building2, ChevronDown, CheckCircle2, FileText, ZoomIn, X } from 'lucide-react';

interface AnalysisResultsProps {
  id: string;
  file: File;
  fileName: string;
  result: AnalysisResult;
  tenants: Tenant[];
  assignment: MeterAssignment;
  onUpdateResult: (updatedResult: AnalysisResult) => void;
  onUpdateAssignment: (assignment: MeterAssignment) => void;
}

export const AnalysisResults: React.FC<AnalysisResultsProps> = ({ 
  file,
  fileName, 
  result, 
  tenants,
  assignment,
  onUpdateResult,
  onUpdateAssignment
}) => {
  const [localResult, setLocalResult] = useState(result);
  const [isManualInput, setIsManualInput] = useState(false);
  const [imageUrl, setImageUrl] = useState<string>('');
  const [isFullScreen, setIsFullScreen] = useState(false);

  // Sync local state when prop changes
  useEffect(() => {
    setLocalResult(result);
  }, [result]);

  // Create object URL for image preview
  useEffect(() => {
    if (file) {
      const url = URL.createObjectURL(file);
      setImageUrl(url);
      return () => URL.revokeObjectURL(url);
    }
  }, [file]);

  const selectedTenant = useMemo(() => 
    tenants.find(t => t.id === assignment.tenantId), 
  [tenants, assignment.tenantId]);

  const handleValueChange = (type: 'start' | 'end', valueStr: string) => {
    const newVal = parseFloat(valueStr);
    if (isNaN(newVal)) return;

    const updated = {
      ...localResult,
      [type === 'start' ? 'startReading' : 'endReading']: {
        ...localResult[type === 'start' ? 'startReading' : 'endReading'],
        value: newVal
      }
    };
    updated.usage = parseFloat(Math.abs(updated.endReading.value - updated.startReading.value).toFixed(2));
    setLocalResult(updated);
    onUpdateResult(updated);
  };

  const handleTenantChange = (tenantId: string) => {
    onUpdateAssignment({ tenantId, meterName: '' });
    setIsManualInput(false);
  };

  // Helper to remove extension
  const displayName = fileName.replace(/\.[^/.]+$/, "");

  return (
    <>
      <div className="w-full bg-white rounded-xl shadow-lg border border-gray-100 overflow-hidden animate-fade-in mb-8 last:mb-0">
          <div className="flex flex-col lg:flex-row items-stretch h-full">
              
              {/* LEFT: Image Panel */}
              <div 
                className="w-full lg:w-5/12 bg-slate-900 relative min-h-[400px] lg:min-h-0 p-4 flex flex-col justify-center items-center group cursor-pointer overflow-hidden"
                onClick={() => setIsFullScreen(true)}
              >
                  <div className="absolute top-0 left-0 w-full p-3 bg-gradient-to-b from-black/60 to-transparent flex justify-between items-start z-10 pointer-events-none">
                      <span className="text-white/80 text-xs font-mono bg-black/40 px-2 py-1 rounded backdrop-blur-md border border-white/10 truncate max-w-[200px]" title={fileName}>
                          {displayName}
                      </span>
                      <span className="text-blue-300 text-xs font-bold uppercase tracking-wider flex items-center gap-1 bg-blue-900/30 px-2 py-1 rounded border border-blue-500/30">
                          <FileImage className="w-3 h-3" /> Original
                      </span>
                  </div>
                  
                  {/* Hover Overlay for Zoom Indication */}
                  <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center z-20 backdrop-blur-[2px]">
                    <div className="bg-white/20 text-white p-3 rounded-full backdrop-blur-md border border-white/30 transform scale-90 group-hover:scale-100 transition-transform">
                      <ZoomIn className="w-8 h-8" />
                    </div>
                  </div>
                  
                  {imageUrl && (
                      <img 
                          src={imageUrl} 
                          alt="Meter Reading" 
                          className="max-w-full max-h-[600px] object-contain shadow-2xl transition-transform duration-300 group-hover:scale-105" 
                      />
                  )}
              </div>

              {/* RIGHT: Data Panel */}
              <div className="w-full lg:w-7/12 p-6 flex flex-col gap-6 bg-white">
                  
                  {/* Header */}
                  <div className="flex items-center gap-3 pb-4 border-b border-gray-100">
                      <div className="p-2 bg-blue-50 rounded-lg">
                          <FileText className="w-5 h-5 text-blue-600" />
                      </div>
                      <div className="min-w-0 flex-1">
                          <h3 className="font-bold text-gray-900 text-lg truncate" title={fileName}>{displayName}</h3>
                          <p className="text-sm text-gray-500">Confirm reading data matches the photo</p>
                      </div>
                  </div>

                  {/* Assignment Form */}
                  <div className="bg-gray-50 rounded-xl p-4 border border-gray-200">
                      <div className="flex items-center gap-2 mb-3">
                          <Building2 className="w-4 h-4 text-gray-500" />
                          <span className="text-xs font-bold text-gray-500 uppercase">Allocation</span>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          {/* Tenant */}
                          <div>
                              <label className="block text-xs text-gray-400 font-bold uppercase mb-1">Company</label>
                              <div className="relative">
                                  <select 
                                    className="w-full bg-white border border-gray-300 text-gray-800 text-sm font-medium rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 block p-2.5 pr-8 cursor-pointer hover:border-blue-400 transition-colors appearance-none"
                                    style={{ WebkitAppearance: 'none', MozAppearance: 'none', appearance: 'none' }}
                                    value={assignment.tenantId}
                                    onChange={(e) => handleTenantChange(e.target.value)}
                                  >
                                    <option value="">Select Tenant...</option>
                                    {tenants.map(t => (
                                      <option key={t.id} value={t.id}>{t.name}</option>
                                    ))}
                                  </select>
                                  <ChevronDown className="absolute right-3 top-3 w-4 h-4 text-gray-400 pointer-events-none" />
                              </div>
                          </div>
                          {/* Meter */}
                          <div>
                              <label className="block text-xs text-gray-400 font-bold uppercase mb-1">Meter ID</label>
                              {assignment.tenantId && selectedTenant && selectedTenant.meters.length > 0 && !isManualInput ? (
                                  <div className="relative">
                                    <select 
                                      className="w-full bg-white border border-gray-300 text-gray-800 text-sm font-medium rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 block p-2.5 pr-8 cursor-pointer hover:border-blue-400 transition-colors appearance-none"
                                      style={{ WebkitAppearance: 'none', MozAppearance: 'none', appearance: 'none' }}
                                      value={assignment.meterName}
                                      onChange={(e) => {
                                        if (e.target.value === 'manual_input_override') {
                                          setIsManualInput(true);
                                          onUpdateAssignment({ ...assignment, meterName: '' });
                                        } else {
                                          onUpdateAssignment({ ...assignment, meterName: e.target.value });
                                        }
                                      }}
                                    >
                                      <option value="">Select Meter...</option>
                                      {selectedTenant.meters.map((m, idx) => (
                                        <option key={idx} value={m}>{m}</option>
                                      ))}
                                      <option disabled>──────────</option>
                                      <option value="manual_input_override">+ Type Manually...</option>
                                    </select>
                                    <ChevronDown className="absolute right-3 top-3 w-4 h-4 text-gray-400 pointer-events-none" />
                                  </div>
                                ) : (
                                  <div className="relative">
                                    <input 
                                      type="text" 
                                      placeholder={!assignment.tenantId ? "Select Tenant First" : "Type Name..."}
                                      disabled={!assignment.tenantId}
                                      className="w-full bg-white border border-gray-300 text-gray-800 text-sm font-medium rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 block p-2.5 disabled:bg-gray-100 disabled:text-gray-400"
                                      value={assignment.meterName}
                                      onChange={(e) => onUpdateAssignment({ ...assignment, meterName: e.target.value })}
                                    />
                                    {isManualInput && (
                                      <button 
                                        onClick={() => setIsManualInput(false)}
                                        className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] bg-gray-200 hover:bg-gray-300 px-2 py-1 rounded text-gray-600 font-bold"
                                      >
                                        X
                                      </button>
                                    )}
                                  </div>
                                )}
                          </div>
                      </div>
                  </div>

                  {/* Data Grid */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      {/* Previous */}
                      <div className="p-4 rounded-xl border border-gray-200 bg-white shadow-sm hover:border-blue-400 transition-all">
                          <div className="flex justify-between items-center mb-2">
                              <span className="text-xs font-bold text-gray-400 uppercase flex items-center gap-1">
                                  <Calendar className="w-3 h-3" /> Previous
                              </span>
                              <span className="text-[10px] bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded font-mono">
                                  {localResult.startReading.date.split(' ')[0]}
                              </span>
                          </div>
                          <input 
                              type="number"
                              step="0.1"
                              value={localResult.startReading.value}
                              onChange={(e) => handleValueChange('start', e.target.value)}
                              className="w-full text-2xl font-bold text-gray-700 bg-transparent border-none focus:ring-0 p-0 placeholder-gray-300"
                          />
                      </div>

                      {/* Current */}
                      <div className="p-4 rounded-xl border border-blue-200 bg-blue-50/30 shadow-sm hover:border-blue-500 transition-all">
                          <div className="flex justify-between items-center mb-2">
                              <span className="text-xs font-bold text-blue-600 uppercase flex items-center gap-1">
                                  <CheckCircle2 className="w-3 h-3" /> Current
                              </span>
                              <span className="text-[10px] bg-blue-100 text-blue-600 px-1.5 py-0.5 rounded font-mono">
                                  {localResult.endReading.date.split(' ')[0]}
                              </span>
                          </div>
                          <input 
                              type="number"
                              step="0.1"
                              value={localResult.endReading.value}
                              onChange={(e) => handleValueChange('end', e.target.value)}
                              className="w-full text-2xl font-bold text-blue-700 bg-transparent border-none focus:ring-0 p-0 placeholder-blue-300"
                          />
                      </div>
                  </div>

                  {/* Total Usage Box */}
                  <div className="mt-auto bg-slate-800 rounded-xl p-5 text-white flex items-center justify-between shadow-lg relative overflow-hidden group">
                      <div className="absolute inset-0 bg-gradient-to-r from-blue-600/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity"></div>
                      <div className="relative z-10 flex items-center gap-3">
                          <div className="p-2 bg-white/10 rounded-lg">
                              <Zap className="w-5 h-5 text-yellow-400 fill-yellow-400" />
                          </div>
                          <div>
                              <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Calculated Usage</p>
                              <p className="text-[10px] text-slate-500">Based on readings</p>
                          </div>
                      </div>
                      <div className="relative z-10 text-right">
                          <span className="text-4xl font-black tracking-tight">{localResult.usage.toLocaleString()}</span>
                          <span className="text-sm font-medium text-slate-400 ml-1">kWh</span>
                      </div>
                  </div>

              </div>

          </div>
      </div>

      {/* Full Screen Image Modal */}
      {isFullScreen && (
        <div 
          className="fixed inset-0 z-[100] bg-black/95 flex items-center justify-center p-4 animate-fade-in"
          onClick={() => setIsFullScreen(false)}
        >
          <button 
            className="absolute top-6 right-6 p-2 bg-white/10 hover:bg-white/20 text-white rounded-full transition-colors cursor-pointer"
            onClick={() => setIsFullScreen(false)}
          >
            <X className="w-6 h-6" />
          </button>
          
          <img 
            src={imageUrl} 
            alt="Full size meter reading" 
            className="max-w-full max-h-[90vh] object-contain rounded-md shadow-2xl animate-zoom-in cursor-default"
            onClick={(e) => e.stopPropagation()} 
          />
        </div>
      )}
    </>
  );
};