import React, { useRef, useState } from 'react';
import { Upload, X, Plus } from 'lucide-react';
import { AnalysisItem } from '../types';

interface ImageUploaderProps {
  onImagesSelect: (files: File[]) => void;
  items: AnalysisItem[];
  onRemove: (index: number) => void;
}

export const ImageUploader: React.FC<ImageUploaderProps> = ({ onImagesSelect, items, onRemove }) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const newFiles = Array.from(e.dataTransfer.files).filter((file: File) => file.type.startsWith('image/'));
      onImagesSelect(newFiles);
    }
  };

  const handleClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const newFiles = Array.from(e.target.files);
      onImagesSelect(newFiles);
      // Reset input value to allow selecting the same file again if needed
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  if (items.length > 0) {
    return (
      <div className="w-full space-y-4">
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-4">
          {items.map((item, index) => (
            <div key={`${item.file.name}-${index}`} className="relative group aspect-square rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
              <img 
                src={item.previewUrl || item.thumbnailUrl} 
                alt={`Preview ${index}`} 
                className="w-full h-full object-cover"
              />
              <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center p-2">
                 <p className="text-white text-xs font-medium truncate w-full text-center mb-2 px-1">{item.file.name}</p>
                 <button 
                  onClick={(e) => { e.stopPropagation(); onRemove(index); }}
                  className="p-1.5 bg-red-500 hover:bg-red-600 text-white rounded-full transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
          
          {/* Add more button */}
          <button
            onClick={handleClick}
            className="flex flex-col items-center justify-center aspect-square rounded-xl border-2 border-dashed border-gray-300 hover:border-blue-400 hover:bg-blue-50 transition-all text-gray-500 hover:text-blue-500"
          >
            <Plus className="w-8 h-8 mb-2" />
            <span className="text-sm font-medium">Add Image</span>
          </button>
        </div>
        
        <input 
          type="file" 
          ref={fileInputRef} 
          onChange={handleFileChange} 
          className="hidden" 
          accept="image/*"
          multiple
        />
      </div>
    );
  }

  return (
    <div
      onClick={handleClick}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className={`
        w-full h-64 border-2 border-dashed rounded-xl cursor-pointer
        flex flex-col items-center justify-center transition-all duration-200
        ${isDragging 
          ? 'border-blue-500 bg-blue-50' 
          : 'border-gray-300 hover:border-blue-400 hover:bg-gray-50 bg-white'
        }
      `}
    >
      <input 
        type="file" 
        ref={fileInputRef} 
        onChange={handleFileChange} 
        className="hidden" 
        accept="image/*"
        multiple
      />
      <div className="bg-blue-100 p-4 rounded-full mb-4">
        <Upload className={`w-8 h-8 text-blue-600 ${isDragging ? 'scale-110' : ''} transition-transform`} />
      </div>
      <p className="text-lg font-semibold text-gray-700">Click or Drag Images Here</p>
      <p className="text-sm text-gray-500 mt-2 text-center max-w-xs">
        Upload multiple utility data screenshots at once.
      </p>
    </div>
  );
};
