import Link from 'next/link';

export default function HelpPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 px-4 py-12 text-slate-200">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(99,102,241,0.1),transparent_40%)] pointer-events-none" />

      <div className="max-w-4xl mx-auto relative z-10">
        <div className="mb-12 text-center">
          <h1 className="text-4xl font-extrabold tracking-tight bg-gradient-to-r from-white via-slate-200 to-indigo-300 bg-clip-text text-transparent mb-4">
            Setting Up Your Vault
          </h1>
          <p className="text-slate-400">Follow these steps to connect your Linux desktop to your secure cloud.</p>
        </div>

        <div className="space-y-6">
          {/* Step 1 */}
          <div className="bg-slate-900/60 backdrop-blur-xl border border-slate-800 rounded-2xl p-6 shadow-xl">
            <div className="flex items-center gap-4 mb-4">
              <div className="flex items-center justify-center w-10 h-10 rounded-full bg-indigo-500/20 text-indigo-400 font-bold border border-indigo-500/30">1</div>
              <h2 className="text-xl font-semibold text-white">Generate Your Secure Key</h2>
            </div>
            <p className="text-slate-400 ml-14">
              Go to your <Link href="/" className="text-indigo-400 hover:text-indigo-300 hover:underline">Dashboard</Link> and click <strong>Generate Key</strong>. This unique token mathematically pairs your desktop engine to your cloud account. Treat it like a password.
            </p>
          </div>

          {/* Step 2 */}
          <div className="bg-slate-900/60 backdrop-blur-xl border border-slate-800 rounded-2xl p-6 shadow-xl">
            <div className="flex items-center gap-4 mb-4">
              <div className="flex items-center justify-center w-10 h-10 rounded-full bg-indigo-500/20 text-indigo-400 font-bold border border-indigo-500/30">2</div>
              <h2 className="text-xl font-semibold text-white">Install the Desktop Engine</h2>
            </div>
            <div className="ml-14 space-y-4 text-slate-400">
              <p>Download the official Debian package from our GitHub Releases page, or compile it directly from source.</p>
              <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 font-mono text-sm text-slate-300">
                <span className="text-slate-500"># Install via dpkg</span><br />
                sudo dpkg -i mydrive-vault_1.0.0_amd64.deb<br />
                <span className="text-slate-500 mt-2 block"># Resolve any missing dependencies</span><br />
                sudo apt-get install -f
              </div>
            </div>
          </div>

          {/* Step 3 */}
          <div className="bg-slate-900/60 backdrop-blur-xl border border-slate-800 rounded-2xl p-6 shadow-xl">
            <div className="flex items-center gap-4 mb-4">
              <div className="flex items-center justify-center w-10 h-10 rounded-full bg-indigo-500/20 text-indigo-400 font-bold border border-indigo-500/30">3</div>
              <h2 className="text-xl font-semibold text-white">Authenticate Your Device</h2>
            </div>
            <div className="ml-14 space-y-4 text-slate-400">
              <p>Link your newly installed engine to the web dashboard using the key you generated in Step 1.</p>
              <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 font-mono text-sm text-slate-300">
                mydrived --auth mdrive_sk_YOUR_COPIED_KEY_HERE
              </div>
            </div>
          </div>

          {/* Step 4 */}
          <div className="bg-slate-900/60 backdrop-blur-xl border border-slate-800 rounded-2xl p-6 shadow-xl">
            <div className="flex items-center gap-4 mb-4">
              <div className="flex items-center justify-center w-10 h-10 rounded-full bg-emerald-500/20 text-emerald-400 font-bold border border-emerald-500/30">✓</div>
              <h2 className="text-xl font-semibold text-white">Start Syncing</h2>
            </div>
            <div className="ml-14 text-slate-400">
              <p className="mb-4">Run the daemon in your terminal. Any files dropped into your watched directory will instantly encrypt, chunk, and sync to your cloud vault.</p>
              <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 font-mono text-sm text-slate-300">
                mydrived
              </div>
            </div>
          </div>
        </div>

        <div className="mt-12 text-center">
          <Link 
            href="/"
            className="inline-flex items-center justify-center px-6 py-3 rounded-xl bg-slate-800 text-white font-medium hover:bg-slate-700 transition-colors border border-slate-700 hover:border-slate-600"
          >
            ← Return to Dashboard
          </Link>
        </div>
      </div>
    </div>
  );
}