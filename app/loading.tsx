export default function ProjectHomeLoading() {
  return (
    <main className="min-h-screen bg-slate-100 text-slate-950">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto max-w-7xl px-4 py-4 sm:px-6">
          <p className="text-xs font-extrabold text-emerald-700">VIDEOBRIEF</p>
          <h1 className="mt-0.5 text-xl font-extrabold">视频项目</h1>
        </div>
      </header>
      <section className="mx-auto max-w-7xl px-4 py-5 sm:px-6" aria-busy="true">
        <div className="h-10 animate-pulse rounded-md border border-slate-200 bg-white" />
        <div className="mt-4 border-y border-slate-200 bg-white px-4 py-12 text-center">
          <p className="text-sm font-bold text-slate-500" role="status">正在读取项目...</p>
        </div>
      </section>
    </main>
  );
}
