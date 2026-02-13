import React, { useState, useMemo, useEffect } from 'react';
import { ImageUploader } from './components/ImageUploader';
import { AnalysisResults } from './components/AnalysisResults';
import { Invoice } from './components/Invoice';
import { analyzeMeterImage } from './services/geminiService';
import { AnalysisResult, Tenant, MeterAssignment } from './types';
import { Activity, AlertCircle, Loader2, Settings, Users, FileText, ChevronRight, Plus, X, Trash2, Building } from 'lucide-react';

interface AnalysisItem {
  id: string;
  file: File;
  status: 'idle' | 'analyzing' | 'success' | 'error';
  result?: AnalysisResult;
  error?: string;
  // Assignment data
  assignment: MeterAssignment;
  isShared?: boolean; // Flag to indicate if this item came from a shared link
}

const DEFAULT_TENANTS: Tenant[] = [
  { id: 't1', name: 'A Corp', meters: ['1F Main', '1F Server', '1F AC'] },
  { id: 't2', name: 'B Corp', meters: ['2F Office', '2F Kitchen'] },
  { id: 't3', name: 'C Corp', meters: ['3F Lab', '3F Warehouse', 'Basement'] },
];

const App: React.FC = () => {
  // Config State
  const [tenants, setTenants] = useState<Tenant[]>(DEFAULT_TENANTS);
  const [unitPrice, setUnitPrice] = useState<number>(150);
  const [showConfig, setShowConfig] = useState(false);
  const [newMeterInputs, setNewMeterInputs] = useState<{[key: string]: string}>({});

  // App State
  const [items, setItems] = useState<AnalysisItem[]>([]);
  const [isAnalyzingAll, setIsAnalyzingAll] = useState(false);
  const [activeTab, setActiveTab] = useState<'analysis' | 'invoice'>('analysis');
  const [isSharedView, setIsSharedView] = useState(false);

  // Check for shared data in URL on mount
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const shareData = params.get('share');

    if (shareData) {
      try {
        const decoded = JSON.parse(decodeURIComponent(shareData));
        // Structure: { t: tenantName, p: unitPrice, i: [ { n: name, s: startVal, e: endVal, u: usage, sd: startDate, ed: endDate } ] }
        
        const sharedTenantId = 'shared-tenant';
        
        // 1. Set Unit Price
        if (decoded.p) setUnitPrice(Number(decoded.p));

        // 2. Setup Tenant
        const sharedTenant: Tenant = {
          id: sharedTenantId,
          name: decoded.t || 'Shared Invoice',
          meters: decoded.i.map((item: any) => item.n)
        };
        setTenants([sharedTenant]);

        // 3. Reconstruct Items
        const reconstructedItems: AnalysisItem[] = decoded.i.map((item: any, idx: number) => ({
          id: `shared-${idx}`,
          file: new File([""], "Image_Not_Available_In_Share_Mode", { type: "text/plain" }), // Dummy file
          status: 'success',
          isShared: true,
          assignment: {
            tenantId: sharedTenantId,
            meterName: item.n
          },
          result: {
            startReading: { value: item.s, date: item.sd },
            endReading: { value: item.e, date: item.ed },
            usage: item.u
          }
        }));

        setItems(reconstructedItems);
        setIsSharedView(true);
        setActiveTab('invoice');
        
        // Remove query param from URL so refresh doesn't stick (optional, but good for UX if they want to upload new stuff)
        // window.history.replaceState({}, document.title, window.location.pathname);
      } catch (e) {
        console.error("Failed to parse shared data", e);
        alert("Invalid shared link.");
      }
    }
  }, []);

  const handleImagesSelect = (files: File[]) => {
    const newItems: AnalysisItem[] = files.map(file => ({
      id: Math.random().toString(36).substr(2, 9),
      file,
      status: 'idle',
      assignment: { tenantId: '', meterName: '' }
    }));
    setItems(prev => [...prev, ...newItems]);
  };

  const handleRemoveImage = (index: number) => {
    setItems(prev => prev.filter((_, i) => i !== index));
  };

  const handleClearAll = () => {
    setItems([]);
  };

  const analyzeItem = async (item: AnalysisItem) => {
    if (item.status === 'success' || item.status === 'analyzing') return;

    setItems(prev => prev.map(i => i.id === item.id ? { ...i, status: 'analyzing', error: undefined } : i));

    try {
      const result = await analyzeMeterImage(item.file);
      setItems(prev => prev.map(i => i.id === item.id ? { ...i, status: 'success', result } : i));
    } catch (err: any) {
      setItems(prev => prev.map(i => i.id === item.id ? { ...i, status: 'error', error: err.message || "Analysis failed" } : i));
    }
  };

  const handleAnalyzeAll = async () => {
    setIsAnalyzingAll(true);
    const idleItems = items.filter(i => i.status === 'idle' || i.status === 'error');
    
    // Run all in parallel
    await Promise.all(idleItems.map(item => analyzeItem(item)));
    setIsAnalyzingAll(false);
  };

  const handleUpdateResult = (id: string, updatedResult: AnalysisResult) => {
    setItems(prev => prev.map(i => i.id === id ? { ...i, result: updatedResult } : i));
  };

  const handleUpdateAssignment = (id: string, assignment: MeterAssignment) => {
     setItems(prev => prev.map(i => i.id === id ? { ...i, assignment } : i));
  };

  // --- Tenant Configuration Handlers ---
  const handleAddTenant = () => {
    const newId = `t-${Date.now()}`;
    setTenants([...tenants, { id: newId, name: 'New Company', meters: [] }]);
  };

  const handleRemoveTenant = (id: string) => {
    if (window.confirm('Are you sure you want to remove this company?')) {
      // Use functional update to ensure we have the latest state and filter by ID
      setTenants(prev => prev.filter(t => t.id !== id));
    }
  };

  const handleAddMeter = (tenantIndex: number, tenantId: string) => {
    const name = newMeterInputs[tenantId]?.trim();
    if (!name) return;

    const newTenants = [...tenants];
    if (!newTenants[tenantIndex].meters.includes(name)) {
      newTenants[tenantIndex].meters.push(name);
      setTenants(newTenants);
      setNewMeterInputs(prev => ({ ...prev, [tenantId]: '' }));
    }
  };

  const handleRemoveMeter = (tenantIndex: number, meterIndex: number) => {
    const newTenants = [...tenants];
    newTenants[tenantIndex].meters.splice(meterIndex, 1);
    setTenants(newTenants);
  };

  const pendingCount = items.filter(i => i.status === 'idle').length;
  const hasResults = items.some(i => i.status === 'success');

  // Group data for invoices
  const invoiceData = useMemo(() => {
    const data = tenants.map(tenant => {
      const tenantItems = items.filter(item => 
        item.status === 'success' && 
        item.result && 
        item.assignment.tenantId === tenant.id
      );

      if (tenantItems.length === 0) return null;

      const itemsWithCost = tenantItems.map(item => ({
        meterName: item.assignment.meterName,
        result: item.result!,
        file: item.file,
        cost: Math.floor(item.result!.usage * unitPrice),
        isShared: item.isShared
      }));

      const totalUsage = itemsWithCost.reduce((acc, curr) => acc + curr.result.usage, 0);
      const totalCost = itemsWithCost.reduce((acc, curr) => acc + curr.cost, 0);

      return {
        tenant,
        items: itemsWithCost,
        totalUsage,
        totalCost
      };
    }).filter(Boolean); // Remove nulls

    return data as any[]; 
  }, [items, tenants, unitPrice]);

  return (
    <div className="min-h-screen bg-gray-100 py-8 print:bg-white print:py-0">
      
      {/* Top Bar / Configuration */}
      <div className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 mb-8 print:hidden">
        <div className="bg-white rounded-xl shadow-sm p-4 flex flex-col md:flex-row justify-between items-center gap-4">
          <div className="flex items-center gap-3">
             <div className="bg-blue-600 p-2 rounded-lg">
               <Activity className="w-6 h-6 text-white" />
             </div>
             <h1 className="text-xl font-bold text-gray-800">Meter Bill Manager</h1>
             {isSharedView && (
               <span className="bg-yellow-100 text-yellow-800 text-xs px-2 py-1 rounded-full font-bold border border-yellow-200">Shared View Mode</span>
             )}
          </div>

          <div className="flex items-center gap-4">
             {!isSharedView && (
               <>
                <div className="flex items-center gap-2 bg-gray-50 px-3 py-2 rounded-lg border border-gray-200">
                    <span className="text-sm font-semibold text-gray-500">Unit Price (₩/kWh):</span>
                    <input 
                      type="number" 
                      value={unitPrice}
                      onChange={(e) => setUnitPrice(Number(e.target.value))}
                      className="w-20 bg-transparent font-bold text-gray-800 focus:outline-none text-right"
                    />
                </div>
                
                <button 
                  onClick={() => setShowConfig(!showConfig)}
                  className={`p-2 rounded-lg transition-colors flex items-center gap-2 text-sm font-medium ${showConfig ? 'bg-blue-100 text-blue-700' : 'text-gray-500 hover:text-blue-600 hover:bg-blue-50'}`}
                >
                  <Settings className="w-5 h-5" />
                  Settings
                </button>
               </>
             )}
             {isSharedView && (
               <button 
                 onClick={() => {
                   window.location.href = window.location.origin;
                 }}
                 className="text-sm text-blue-600 hover:underline"
               >
                 Create New Bill
               </button>
             )}
          </div>
        </div>

        {/* Tenant Config Panel */}
        {showConfig && !isSharedView && (
          <div className="mt-4 bg-white rounded-xl shadow-lg border border-gray-200 p-6 animate-slide-down">
            <h3 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2 border-b pb-2">
              <Users className="w-5 h-5 text-blue-600" /> Manage Companies & Meters
            </h3>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
              {tenants.map((tenant, idx) => (
                <div key={tenant.id} className="bg-gray-50 rounded-xl p-4 border border-gray-200 hover:border-blue-300 transition-colors flex flex-col h-full">
                  {/* Header: Name & Delete */}
                  <div className="flex items-center justify-between gap-2 mb-4 pb-2 border-b border-gray-200">
                    <div className="flex items-center gap-2 flex-1">
                      <Building className="w-4 h-4 text-gray-400" />
                      <input 
                        type="text" 
                        value={tenant.name}
                        onChange={(e) => {
                          const newTenants = [...tenants];
                          newTenants[idx].name = e.target.value;
                          setTenants(newTenants);
                        }}
                        className="flex-1 font-bold text-gray-800 bg-transparent border border-transparent hover:border-gray-300 hover:bg-white focus:bg-white focus:border-blue-500 focus:outline-none px-1 py-0.5 rounded transition-all"
                      />
                    </div>
                    <button 
                      onClick={() => handleRemoveTenant(tenant.id)}
                      className="p-1 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded transition-colors"
                      title="Remove Company"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>

                  {/* Meter List */}
                  <div className="space-y-2 mb-4 flex-1">
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Meters</p>
                    <div className="flex flex-wrap gap-2">
                      {tenant.meters.length === 0 && (
                        <p className="text-xs text-gray-400 italic">No meters configured.</p>
                      )}
                      {tenant.meters.map((meter, meterIdx) => (
                        <div key={meterIdx} className="group flex items-center gap-1 bg-white border border-gray-200 rounded-md px-2 py-1 text-xs shadow-sm">
                          <span className="font-medium text-gray-700">{meter}</span>
                          <button 
                            onClick={() => handleRemoveMeter(idx, meterIdx)}
                            className="text-gray-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Add Meter Input */}
                  <div className="flex items-center gap-2 mt-auto pt-2">
                    <input 
                      type="text" 
                      placeholder="New meter name..." 
                      className="flex-1 text-sm border border-gray-300 rounded px-2 py-1.5 focus:ring-1 focus:ring-blue-500 focus:outline-none"
                      value={newMeterInputs[tenant.id] || ''}
                      onChange={(e) => setNewMeterInputs(prev => ({ ...prev, [tenant.id]: e.target.value }))}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleAddMeter(idx, tenant.id);
                      }}
                    />
                    <button 
                      onClick={() => handleAddMeter(idx, tenant.id)}
                      className="bg-blue-600 hover:bg-blue-700 text-white p-1.5 rounded transition-colors"
                    >
                      <Plus className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
              
              {/* Add New Tenant Card */}
              <button
                onClick={handleAddTenant}
                className="min-h-[200px] border-2 border-dashed border-gray-300 rounded-xl p-6 flex flex-col items-center justify-center text-gray-400 hover:text-blue-600 hover:border-blue-400 hover:bg-blue-50 transition-all gap-3"
              >
                <div className="bg-white p-3 rounded-full shadow-sm">
                  <Plus className="w-6 h-6" />
                </div>
                <span className="font-semibold">Add New Company</span>
              </button>
            </div>

            <div className="pt-4 border-t text-right">
              <button 
                onClick={() => setShowConfig(false)}
                className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-sm font-medium transition-colors"
              >
                Close Settings
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 print:max-w-none print:px-0">
        
        {/* Tabs - Hidden in Shared View */}
        {!isSharedView && (
          <div className="flex justify-center mb-8 print:hidden">
            <div className="bg-white p-1 rounded-xl shadow-sm inline-flex border border-gray-200">
                <button 
                  onClick={() => setActiveTab('analysis')}
                  className={`px-6 py-2 rounded-lg text-sm font-semibold transition-all ${activeTab === 'analysis' ? 'bg-blue-600 text-white shadow-md' : 'text-gray-500 hover:text-gray-800'}`}
                >
                  1. Upload & Assign
                </button>
                <div className="w-px bg-gray-200 my-2 mx-1"></div>
                <button 
                  onClick={() => setActiveTab('invoice')}
                  className={`px-6 py-2 rounded-lg text-sm font-semibold transition-all flex items-center gap-2 ${activeTab === 'invoice' ? 'bg-blue-600 text-white shadow-md' : 'text-gray-500 hover:text-gray-800'}`}
                >
                  2. View Invoices
                  {hasResults && <span className="bg-red-500 text-white text-[10px] px-1.5 py-0.5 rounded-full">{invoiceData.length}</span>}
                </button>
            </div>
          </div>
        )}

        {/* Analysis View */}
        {activeTab === 'analysis' && (
          <div className="space-y-8 animate-fade-in">
            {/* Upload Section */}
            <div className="bg-white rounded-2xl shadow-sm p-6 sm:p-8 border border-gray-200">
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-lg font-bold text-gray-800">Upload Meter Photos</h2>
                {items.length > 0 && (
                  <button 
                    onClick={handleClearAll}
                    className="text-sm text-red-500 hover:text-red-700 font-medium"
                  >
                    Clear All
                  </button>
                )}
              </div>
              
              <ImageUploader 
                onImagesSelect={handleImagesSelect} 
                selectedFiles={items.map(i => i.file)}
                onRemove={handleRemoveImage}
              />
              
              {items.length > 0 && pendingCount > 0 && (
                <div className="mt-6 flex justify-end">
                  <button
                    onClick={handleAnalyzeAll}
                    disabled={isAnalyzingAll}
                    className="px-6 py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white font-semibold rounded-lg shadow-lg hover:shadow-xl transform hover:-translate-y-0.5 transition-all duration-200 flex items-center gap-2"
                  >
                    {isAnalyzingAll ? (
                      <>
                        <Loader2 className="w-5 h-5 animate-spin" />
                        Analyzing...
                      </>
                    ) : (
                      <>
                        <Activity className="w-5 h-5" />
                        Analyze {pendingCount} Pending Items
                      </>
                    )}
                  </button>
                </div>
              )}
            </div>

            {/* Results Grid - Single Column now */}
            <div className="grid grid-cols-1 gap-8">
              {items.map((item) => {
                if (item.status === 'idle') return null;
                
                // Wrap content based on state
                return (
                  <div key={item.id} className="col-span-1">
                    {item.status === 'analyzing' && (
                      <div className="w-full h-full min-h-[300px] bg-white rounded-xl shadow p-6 border border-gray-100 flex flex-col items-center justify-center space-y-4">
                          <Loader2 className="w-10 h-10 text-blue-600 animate-spin" />
                          <div className="text-center">
                            <p className="font-bold text-gray-800">Reading Meter...</p>
                            <p className="text-sm text-gray-500">{item.file.name}</p>
                          </div>
                      </div>
                    )}

                    {item.status === 'error' && (
                      <div className="w-full h-full min-h-[200px] bg-red-50 rounded-xl p-6 border border-red-200 flex flex-col items-center justify-center text-center gap-4">
                          <AlertCircle className="w-10 h-10 text-red-500" />
                          <div>
                            <h4 className="font-bold text-red-800">Failed to Read</h4>
                            <p className="text-red-600 text-sm mt-1">{item.file.name}</p>
                            <p className="text-red-500 text-xs mt-2 max-w-xs mx-auto">{item.error}</p>
                          </div>
                          <button 
                          onClick={() => analyzeItem(item)}
                          className="px-4 py-2 bg-white border border-red-200 rounded-lg text-red-600 text-sm font-medium hover:bg-red-50 shadow-sm"
                          >
                            Retry Analysis
                          </button>
                      </div>
                    )}

                    {item.status === 'success' && item.result && (
                      <AnalysisResults 
                        id={item.id}
                        file={item.file}
                        fileName={item.file.name}
                        result={item.result} 
                        tenants={tenants}
                        assignment={item.assignment}
                        onUpdateResult={(updated) => handleUpdateResult(item.id, updated)}
                        onUpdateAssignment={(assignment) => handleUpdateAssignment(item.id, assignment)}
                      />
                    )}
                  </div>
                );
              })}
            </div>

            {/* Navigation Hint */}
            {hasResults && (
              <div className="flex justify-center mt-12 pb-12">
                 <button 
                  onClick={() => setActiveTab('invoice')}
                  className="group flex items-center gap-2 px-8 py-4 bg-gray-900 text-white rounded-full font-bold shadow-xl hover:bg-black transition-all hover:scale-105"
                 >
                   Go to Invoices <ChevronRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                 </button>
              </div>
            )}
          </div>
        )}

        {/* Invoice View */}
        {activeTab === 'invoice' && (
           <div>
             {invoiceData.length === 0 ? (
               <div className="text-center py-24 bg-white rounded-2xl border border-dashed border-gray-300">
                 <FileText className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                 <h3 className="text-xl font-bold text-gray-400">No Invoices Ready</h3>
                 <p className="text-gray-400 mt-2">Upload photos and assign them to tenants first.</p>
                 <button 
                  onClick={() => setActiveTab('analysis')}
                  className="mt-6 text-blue-600 font-medium hover:underline"
                 >
                   Go to Upload
                 </button>
               </div>
             ) : (
                <Invoice invoices={invoiceData} unitPrice={unitPrice} isSharedView={isSharedView} />
             )}
           </div>
        )}

      </div>
    </div>
  );
};

export default App;