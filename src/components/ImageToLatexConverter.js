import React, { useState, useRef } from 'react';
import { Upload, Copy, FileImage, Zap, AlertCircle, CheckCircle, X, Info } from 'lucide-react';

const ImageToLatexConverter = () => {
  const [image, setImage] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);
  const [instructions, setInstructions] = useState('');
  const [latexCode, setLatexCode] = useState('');
  const [isConverting, setIsConverting] = useState(false);
  const [copySuccess, setCopySuccess] = useState(false);
  const [error, setError] = useState('');
  const [dragActive, setDragActive] = useState(false);
  const fileInputRef = useRef(null);

  // Environment variables with fallbacks
  const getEnvVar = (name, defaultValue = '') => {
    try {
      return process?.env?.[name] || defaultValue;
    } catch {
      return defaultValue;
    }
  };

  const API_KEY = getEnvVar('REACT_APP_ANTHROPIC_API_KEY');
  const MAX_FILE_SIZE = parseInt(getEnvVar('REACT_APP_MAX_FILE_SIZE_MB', '25')) * 1024 * 1024;
  const SUPPORTED_FORMATS = ['image/png', 'image/jpeg', 'image/jpg', 'image/gif', 'image/webp'];

  const validateFile = (file) => {
    if (!file) {
      return 'No file selected';
    }

    if (!SUPPORTED_FORMATS.includes(file.type)) {
      return 'Please upload a valid image file (PNG, JPG, JPEG, GIF, WebP)';
    }

    if (file.size > MAX_FILE_SIZE) {
      return `File size must be less than ${MAX_FILE_SIZE / (1024 * 1024)}MB. Current size: ${(file.size / (1024 * 1024)).toFixed(2)}MB`;
    }

    return null;
  };

  const handleImageUpload = (file) => {
    const validationError = validateFile(file);
    
    if (validationError) {
      setError(validationError);
      return;
    }

    setImage(file);
    setError('');
    setLatexCode(''); // Clear previous results
    
    // Create preview URL
    const reader = new FileReader();
    reader.onload = (e) => {
      setImagePreview(e.target.result);
    };
    reader.onerror = () => {
      setError('Failed to read the image file');
    };
    reader.readAsDataURL(file);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragActive(false);
    
    const files = e.dataTransfer.files;
    if (files.length > 0) {
      handleImageUpload(files[0]);
    }
  };

  const handleDragOver = (e) => {
    e.preventDefault();
  };

  const handleDragEnter = (e) => {
    e.preventDefault();
    setDragActive(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    if (!e.currentTarget.contains(e.relatedTarget)) {
      setDragActive(false);
    }
  };

  const convertToLatex = async () => {
    if (!image) {
      setError('Please upload an image first');
      return;
    }

    setIsConverting(true);
    setError('');
    setLatexCode('');

    try {
      // Demo mode when no API key is provided
      if (!API_KEY) {
        // Simulate API delay
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        const demoLatex = `% Demo LaTeX output - Add your API key for real conversion
\\documentclass{article}
\\usepackage{amsmath}
\\usepackage{amsfonts}

\\begin{document}

% This is a demo response. To get real conversions:
% 1. Add your Anthropic API key to .env.local
% 2. Set REACT_APP_ANTHROPIC_API_KEY=your_key_here

\\begin{equation}
    E = mc^2
\\end{equation}

\\begin{align}
    \\nabla \\cdot \\vec{E} &= \\frac{\\rho}{\\epsilon_0} \\\\
    \\nabla \\cdot \\vec{B} &= 0
\\end{align}

\\end{document}`;
        
        setLatexCode(demoLatex);
        return;
      }

      // Convert image to base64
      const base64Data = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          const base64 = reader.result.split(',')[1];
          resolve(base64);
        };
        reader.onerror = () => reject(new Error('Failed to read file'));
        reader.readAsDataURL(image);
      });

      // Prepare the prompt with instructions
      let prompt = `Please analyze this image and convert it to LaTeX code suitable for Overleaf. 

IMPORTANT INSTRUCTIONS:
- Generate clean, properly formatted LaTeX code
- Use standard LaTeX packages when needed (\\usepackage{} statements)
- For equations, use appropriate math environments ($, \\begin{equation}, \\begin{align}, etc.)
- For tables, use tabular environment with proper alignment
- For diagrams, provide TikZ code if possible, otherwise describe what's needed
- Ensure the code is copy-paste ready for Overleaf
- Include necessary package imports at the top if needed
- Use proper spacing and indentation
- Add comments for complex sections

${instructions ? `\nSPECIAL USER INSTRUCTIONS:\n${instructions}\n` : ''}

Respond with ONLY the LaTeX code, no explanations or markdown formatting. Start directly with the LaTeX code.`;

      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": API_KEY,
          "anthropic-version": "2023-06-01"
        },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 2000,
          messages: [
            {
              role: "user",
              content: [
                {
                  type: "image",
                  source: {
                    type: "base64",
                    media_type: image.type,
                    data: base64Data,
                  }
                },
                {
                  type: "text",
                  text: prompt
                }
              ]
            }
          ]
        })
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(`API request failed: ${response.status} - ${errorData.error?.message || 'Unknown error'}`);
      }

      const data = await response.json();
      
      if (!data.content || !data.content[0] || !data.content[0].text) {
        throw new Error('Invalid response format from API');
      }
      
      const generatedLatex = data.content[0].text.trim();
      setLatexCode(generatedLatex);
      
    } catch (err) {
      console.error('Error converting image:', err);
      
      if (err.message.includes('401')) {
        setError('Invalid API key. Please check your Anthropic API key in the .env.local file.');
      } else if (err.message.includes('403')) {
        setError('Access forbidden. Please check your API key permissions.');
      } else if (err.message.includes('429')) {
        setError('Rate limit exceeded. Please wait a moment and try again.');
      } else if (err.message.includes('Failed to fetch')) {
        setError('Network error. Please check your internet connection and try again.');
      } else {
        setError(`Failed to convert image to LaTeX: ${err.message}`);
      }
    } finally {
      setIsConverting(false);
    }
  };

  const copyToClipboard = async () => {
    if (!latexCode) return;
    
    try {
      await navigator.clipboard.writeText(latexCode);
      setCopySuccess(true);
      setTimeout(() => setCopySuccess(false), 2000);
    } catch (err) {
      // Fallback for older browsers
      const textArea = document.createElement('textarea');
      textArea.value = latexCode;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
      setCopySuccess(true);
      setTimeout(() => setCopySuccess(false), 2000);
    }
  };

  const resetTool = () => {
    setImage(null);
    setImagePreview(null);
    setLatexCode('');
    setInstructions('');
    setError('');
    setCopySuccess(false);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const formatFileSize = (bytes) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="text-center mb-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-2 flex items-center justify-center gap-3">
          <Zap className="w-8 h-8 text-blue-600" />
          Image-to-LaTeX Converter
        </h1>
        <p className="text-gray-600 max-w-2xl mx-auto">
          Convert images of equations, diagrams, and tables to LaTeX code for Overleaf. 
          Powered by Claude Sonnet 4 for accurate mathematical content recognition.
        </p>
      </div>

      {/* API Key Warning */}
      {!API_KEY && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 flex items-start space-x-3">
          <AlertCircle className="w-5 h-5 text-yellow-600 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-yellow-800">Demo Mode - API Key Missing</p>
            <p className="text-sm text-yellow-700">
              Add your Anthropic API key to .env.local for real conversions. Currently running in demo mode with sample output.
            </p>
            <p className="text-xs text-yellow-600 mt-1">
              Get your API key from: <a href="https://console.anthropic.com/" target="_blank" rel="noopener noreferrer" className="underline">console.anthropic.com</a>
            </p>
          </div>
        </div>
      )}

      <div className="grid md:grid-cols-2 gap-6">
        {/* Left Column - Input */}
        <div className="space-y-6">
          {/* Image Upload */}
          <div className={`bg-white rounded-lg border-2 border-dashed transition-colors ${
            dragActive ? 'border-blue-500 bg-blue-50' : 'border-gray-300'
          }`}>
            <div
              className="p-6 text-center cursor-pointer"
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              onDragEnter={handleDragEnter}
              onDragLeave={handleDragLeave}
              onClick={() => fileInputRef.current?.click()}
            >
              {imagePreview ? (
                <div className="space-y-4">
                  <div className="relative">
                    <img
                      src={imagePreview}
                      alt="Uploaded"
                      className="max-w-full max-h-64 mx-auto rounded-lg shadow-md"
                    />
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        resetTool();
                      }}
                      className="absolute top-2 right-2 bg-red-500 hover:bg-red-600 text-white rounded-full p-1 transition-colors"
                      title="Remove image"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                  {image && (
                    <div className="text-sm text-gray-600">
                      <p className="font-medium">{image.name}</p>
                      <p>{formatFileSize(image.size)} • {image.type}</p>
                    </div>
                  )}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      fileInputRef.current?.click();
                    }}
                    className="text-sm text-blue-600 hover:text-blue-800 underline"
                  >
                    Upload different image
                  </button>
                </div>
              ) : (
                <div className="space-y-4">
                  <FileImage className={`w-12 h-12 mx-auto ${dragActive ? 'text-blue-500' : 'text-gray-400'}`} />
                  <div>
                    <p className="text-lg font-medium text-gray-700">Upload an image</p>
                    <p className="text-sm text-gray-500">Drag & drop or click to select</p>
                    <p className="text-xs text-gray-400 mt-2">
                      Supports PNG, JPG, JPEG, GIF, WebP • Max size: 25MB
                    </p>
                  </div>
                </div>
              )}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={(e) => handleImageUpload(e.target.files[0])}
                className="hidden"
              />
            </div>
          </div>

          {/* Instructions */}
          <div className="bg-white rounded-lg border border-gray-200 p-6">
            <label className="block text-sm font-medium text-gray-700 mb-3 flex items-center gap-2">
              <Info className="w-4 h-4" />
              Special Instructions (Optional)
            </label>
            <textarea
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              placeholder="Enter any special instructions:&#10;• Symbol meanings (e.g., 'θ represents angle')&#10;• What to include/exclude&#10;• Formatting preferences&#10;• Required LaTeX packages&#10;• Context about the content"
              rows={6}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-none text-sm"
            />
            <p className="text-xs text-gray-500 mt-2">
              Help improve accuracy by providing context about symbols, notation, or specific requirements
            </p>
          </div>

          {/* Convert Button */}
          <button
            onClick={convertToLatex}
            disabled={!image || isConverting}
            className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed text-white font-medium py-3 px-4 rounded-lg transition-colors flex items-center justify-center space-x-2"
          >
            {isConverting ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"></div>
                <span>{API_KEY ? 'Converting...' : 'Generating Demo...'}</span>
              </>
            ) : (
              <>
                <Zap className="w-4 h-4" />
                <span>{API_KEY ? 'Convert to LaTeX' : 'Try Demo Mode'}</span>
              </>
            )}
          </button>
        </div>

        {/* Right Column - Output */}
        <div className="space-y-6">
          {/* LaTeX Code Output */}
          <div className="bg-white rounded-lg border border-gray-200">
            <div className="flex items-center justify-between p-4 border-b border-gray-200">
              <h3 className="font-medium text-gray-900 flex items-center gap-2">
                <FileImage className="w-4 h-4" />
                Generated LaTeX Code
              </h3>
              {latexCode && (
                <button
                  onClick={copyToClipboard}
                  className="flex items-center space-x-2 px-3 py-1 bg-green-600 hover:bg-green-700 text-white text-sm rounded-md transition-colors"
                >
                  {copySuccess ? (
                    <>
                      <CheckCircle className="w-4 h-4" />
                      <span>Copied!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-4 h-4" />
                      <span>Copy Code</span>
                    </>
                  )}
                </button>
              )}
            </div>
            <div className="p-4">
              {latexCode ? (
                <div className="space-y-3">
                  <pre className="bg-gray-50 p-4 rounded-md text-sm font-mono overflow-x-auto whitespace-pre-wrap border max-h-96">
                    {latexCode}
                  </pre>
                  <div className="flex items-center justify-between text-xs text-gray-500">
                    <span>{latexCode.split('\n').length} lines • {latexCode.length} characters</span>
                    <span>Ready for Overleaf</span>
                  </div>
                </div>
              ) : (
                <div className="text-center py-12 text-gray-500">
                  <Upload className="w-8 h-8 mx-auto mb-3 opacity-50" />
                  <p className="font-medium">LaTeX code will appear here</p>
                  <p className="text-sm mt-1">Upload an image and click convert to get started</p>
                </div>
              )}
            </div>
          </div>

          {/* Usage Instructions */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-6">
            <h4 className="font-medium text-blue-900 mb-3 flex items-center gap-2">
              <Info className="w-4 h-4" />
              Tips for Best Results
            </h4>
            <ul className="text-sm text-blue-800 space-y-2">
              <li>• Use clear, high-contrast images with good lighting</li>
              <li>• Provide context in the instructions for unusual symbols or notation</li>
              <li>• For handwritten content, ensure writing is legible</li>
              <li>• Specify if you want only certain parts converted (equations only, etc.)</li>
              <li>• Include any required LaTeX packages in your instructions if needed</li>
              <li>• For complex diagrams, mention if you prefer TikZ or other methods</li>
            </ul>
          </div>
        </div>
      </div>

      {/* Error Display */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-start space-x-3">
          <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-sm font-medium text-red-800">Error</p>
            <p className="text-sm text-red-700">{error}</p>
          </div>
          <button
            onClick={() => setError('')}
            className="text-red-400 hover:text-red-600"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  );
};

export default ImageToLatexConverter;