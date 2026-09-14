import { StatusLinha } from "@/lib/types";

const ESTILOS: Record<StatusLinha, string> = {
  ok: "bg-emerald-50 text-emerald-800 border-emerald-200",
  aviso: "bg-amber-50 text-amber-800 border-amber-200",
  bloqueado: "bg-red-50 text-red-700 border-red-200",
};

const PONTOS: Record<StatusLinha, string> = {
  ok: "bg-emerald-500",
  aviso: "bg-amber-500",
  bloqueado: "bg-red-500",
};

const ROTULOS: Record<StatusLinha, string> = {
  ok: "OK",
  aviso: "Revisar",
  bloqueado: "Bloqueado",
};

export default function StatusBadge({ status }: { status: StatusLinha }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-bold shadow-sm ${ESTILOS[status]}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${PONTOS[status]}`} />
      {ROTULOS[status]}
    </span>
  );
}
