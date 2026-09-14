"use client";
/* eslint-disable @next/next/no-img-element -- URLs são fornecidas pelo usuário e não podem ser pré-configuradas no Image. */

import { useEffect, useState } from "react";

interface Props {
  url: string;
  onDisponibilidade?: (disponivel: boolean) => void;
}

export default function ImagemMiniatura({ url, onDisponibilidade }: Props) {
  const [quebrada, setQuebrada] = useState(false);

  useEffect(() => {
    setQuebrada(false);
  }, [url]);

  if (!url || quebrada) {
    return (
      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-slate-50 px-1 text-center text-[10px] font-semibold leading-tight text-slate-400">
        {url ? "indisponível" : "sem foto"}
      </div>
    );
  }

  return (
    <img
      src={url}
      alt="Miniatura do produto"
      referrerPolicy="no-referrer"
      loading="lazy"
      onLoad={() => onDisponibilidade?.(true)}
      onError={() => {
        setQuebrada(true);
        onDisponibilidade?.(false);
      }}
      className="h-12 w-12 shrink-0 rounded-xl border border-white object-cover shadow-md ring-1 ring-slate-200"
    />
  );
}
