"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";

type Breadcrumb = { id: string | null; name: string };

export default function Dashboard() {
  const router = useRouter();
  const [folders, setFolders] = useState<any[]>([]);
  const [files, setFiles] = useState<any[]>([]);
  const [daemonToken, setDaemonToken] = useState<string>("");
  
  // Navigation State
  const [breadcrumbs, setBreadcrumbs] = useState<Breadcrumb[]>([{ id: null, name: "Home" }]);
  const currentFolderId = breadcrumbs[breadcrumbs.length - 1].id;

  const fetchContents = async () => {
    try {
      const url = currentFolderId ? `/api/files?folderId=${currentFolderId}` : "/api/files";
      const res = await fetch(url);
      
      if (res.ok) {
        const data = await res.json();
        setFolders(data.folders || []);
        setFiles(data.files || []);
      } else if (res.status === 401) {
        router.push("/login");
      } else {
        console.error("API returned an error:", await res.text());
      }
    } catch (err) {
      console.error("Network error:", err);
    }
  };

  useEffect(() => {
    fetchContents();
    const interval = setInterval(fetchContents, 3000); 
    return () => clearInterval(interval);
  }, [currentFolderId]);

  const handleFolderClick = (folder: any) => {
    if (breadcrumbs[breadcrumbs.length - 1].id === folder.id) return;
    setBreadcrumbs([...breadcrumbs, { id: folder.id, name: folder.name }]);
  };

  const handleBreadcrumbClick = (index: number) => {
    setBreadcrumbs(breadcrumbs.slice(0, index + 1));
  };

  const handleLogout = async () => {
    const res = await fetch('/api/auth/logout', { method: 'POST' });
    if (res.ok) {
      window.location.href = '/login'; 
    }
  };

  const generateToken = async () => {
    const res = await fetch("/api/auth/token", { method: "POST" });
    if (res.ok) {
      const data = await res.json();
      setDaemonToken(data.token);
    } else {
      alert("Failed to generate security token.");
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 font-sans text-slate-200 relative overflow-hidden">
      {/* Background Glow */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(99,102,241,0.15),transparent_45%)] pointer-events-none" />

      {/* Secure Top Navigation Bar */}
      <header className="relative z-10 bg-slate-950/50 backdrop-blur-xl border-b border-slate-800/80 p-4 flex items-center justify-between shadow-2xl">
        <div className="flex items-center gap-3 pl-4 max-w-6xl mx-auto w-full">
          <div className="flex items-center gap-3 flex-1">
            <div className="p-2 bg-indigo-500/20 rounded-lg border border-indigo-500/30">
              <svg className="w-5 h-5 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 15a4 4 0 004 4h9a5 5 0 10-.1-9.999 5.002 5.002 0 10-9.78 2.096A4.001 4.001 0 003 15z"></path></svg>
            </div>
            <h1 className="font-extrabold text-xl tracking-tight bg-gradient-to-r from-white to-slate-400 bg-clip-text text-transparent">myDrive Vault</h1>
          </div>
          
          <button 
            onClick={handleLogout}
            className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-slate-400 hover:text-white hover:bg-slate-800/80 border border-transparent hover:border-slate-700 rounded-lg transition-all duration-200"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"></path></svg>
            Sign Out
          </button>
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-4 relative z-10">
        
        {/* Token Generator Panel */}
        <div className="mt-8 p-6 bg-slate-900/60 backdrop-blur-md border border-slate-800/80 rounded-2xl flex flex-col md:flex-row items-center justify-between gap-6 shadow-xl">
          <div>
            <h3 className="text-white font-bold text-lg flex items-center gap-2">
              <svg className="w-5 h-5 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z"></path></svg>
              C++ Daemon Sync Key
            </h3>
            <p className="text-sm text-slate-400 mt-1">Generate your authorization credential to sync files from your terminal engine.</p>
          </div>
          <div className="flex gap-3 items-center w-full md:w-auto">
            {daemonToken && (
              <input 
                type="text" readOnly value={daemonToken}
                className="bg-slate-950/80 border border-slate-700 rounded-xl p-3 text-sm font-mono text-emerald-400 select-all outline-none w-full md:w-80 shadow-inner"
              />
            )}
            <button 
              onClick={generateToken}
              className="relative group overflow-hidden bg-gradient-to-r from-indigo-600 to-violet-600 text-white text-sm font-bold px-6 py-3 rounded-xl shadow-lg shadow-indigo-600/20 hover:shadow-indigo-600/40 hover:from-indigo-500 hover:to-violet-500 transition-all duration-200 whitespace-nowrap"
            >
              {daemonToken ? "Regenerate Key" : "Generate Key"}
            </button>
          </div>
        </div>

        {/* Main Vault Explorer */}
        <div className="mt-8 bg-slate-900/40 backdrop-blur-xl rounded-2xl shadow-2xl border border-slate-800 overflow-hidden mb-12">
          
          {/* Breadcrumbs */}
          <div className="p-5 border-b border-slate-800 bg-slate-950/50 flex items-center gap-3 text-sm font-medium">
            <svg className="w-5 h-5 text-indigo-400" fill="currentColor" viewBox="0 0 20 20"><path d="M2 6a2 2 0 012-2h5l2 2h5a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V6z"></path></svg>
            <div className="flex items-center flex-wrap gap-2">
              {breadcrumbs.map((crumb, index) => (
                <span key={`${crumb.id || 'root'}-${index}`} className="flex items-center gap-2">
                  <button 
                    onClick={() => handleBreadcrumbClick(index)}
                    className={`transition-colors ${index === breadcrumbs.length - 1 ? 'text-white font-bold' : 'text-slate-400 hover:text-indigo-300 hover:underline'}`}
                  >
                    {crumb.name}
                  </button>
                  {index < breadcrumbs.length - 1 && <span className="text-slate-600">/</span>}
                </span>
              ))}
            </div>
          </div>

          {/* Content Explorer */}
          <div className="min-h-[400px]">
            {folders?.length === 0 && files?.length === 0 && (
              <div className="flex flex-col items-center justify-center h-64 text-center">
                <svg className="w-16 h-16 text-slate-700 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1" d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4"></path></svg>
                <p className="text-slate-400 text-lg font-medium">This folder is empty</p>
                <p className="text-slate-500 text-sm mt-1">Drop files into your local daemon vault to sync</p>
              </div>
            )}

            <ul className="divide-y divide-slate-800/50">
              {/* Render Folders */}
              {folders?.map(folder => (
                <li 
                  key={folder.id} 
                  onClick={() => handleFolderClick(folder)}
                  className="p-4 px-6 flex items-center gap-4 hover:bg-slate-800/40 cursor-pointer transition-all duration-200 group"
                >
                  <div className="p-2.5 bg-indigo-500/10 border border-indigo-500/20 rounded-xl text-indigo-400 group-hover:scale-110 transition-transform">
                    <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20"><path d="M2 6a2 2 0 012-2h5l2 2h5a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V6z"></path></svg>
                  </div>
                  <span className="font-semibold text-slate-200 group-hover:text-indigo-300 transition-colors">{folder.name}</span>
                </li>
              ))}

              {/* Render Files */}
              {files?.map(file => (
                <li key={file.id} className="p-4 px-6 flex items-center justify-between hover:bg-slate-800/30 transition-all duration-200 group">
                  <div className="flex items-center gap-4">
                    <div className="p-2.5 bg-slate-800 border border-slate-700 rounded-xl text-slate-400">
                      <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4z" clipRule="evenodd"></path></svg>
                    </div>
                    <span className="text-slate-300 font-medium">{file.filename}</span>
                  </div>
                  
                  <div className="flex items-center gap-4">
                    <div className="flex gap-3 text-xs font-bold items-center">
                      <span className="text-slate-500 tracking-wide">{(file.total_size / 1024).toFixed(1)} KB</span>
                      <span className={`px-2.5 py-1 rounded-md border ${
                        file.status === 'CLEAN' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 
                        file.status === 'UPLOADED' ? 'bg-amber-500/10 text-amber-400 border-amber-500/20' : 
                        'bg-slate-800 text-slate-300 border-slate-700'
                      }`}>
                        {file.status}
                      </span>
                    </div>

                    <div className="flex items-center gap-1 ml-4 border-l border-slate-800 pl-4">
                      <button 
                        onClick={() => window.open(`/api/files/download?fileId=${file.id}`, '_blank')}
                        className="p-2 text-indigo-400 hover:text-white hover:bg-indigo-500/20 rounded-lg transition-colors flex items-center gap-1.5 text-sm font-semibold"
                        title="Download File"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"></path></svg>
                        <span className="hidden sm:inline">Get</span>
                      </button>

                      <button 
                        onClick={async () => {
                          if (!confirm(`Are you sure you want to permanently delete ${file.filename}?`)) return;
                          const res = await fetch(`/api/files?fileId=${file.id}`, { method: 'DELETE' });
                          if (res.ok) {
                            setFiles(files.filter(f => f.id !== file.id));
                          } else {
                            alert('Failed to delete file from the cloud.');
                          }
                        }}
                        className="p-2 text-rose-400 hover:text-white hover:bg-rose-500/20 rounded-lg transition-colors flex items-center gap-1.5 text-sm font-semibold"
                        title="Delete File"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
                        <span className="hidden sm:inline">Trash</span>
                      </button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}