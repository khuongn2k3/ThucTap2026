export default function Loader({ text = "Đang xử lý..." }) {
  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/40">
      <div className="w-[220px] rounded-lg bg-white p-6 text-center shadow-lg">
        <div className="mx-auto mb-3 h-10 w-10 animate-spin rounded-full border-4 border-gray-300 border-t-indigo-600" />
        <p className="text-sm text-gray-700">{text}</p>
      </div>
    </div>
  )
}
