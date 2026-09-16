"use client";

import { useEffect } from "react";

/**
 * Registra el service worker que habilita el aviso de instalar.
 *
 * Si falla no pasa nada y por eso no se avisa: sin service worker la app
 * funciona igual y se puede instalar igual desde el menú del navegador.
 * Lo único que se pierde es que el aviso aparezca solo.
 */
export default function RegistrarSW() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  }, []);

  return null;
}
