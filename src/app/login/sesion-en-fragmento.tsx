"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { createClient } from "@/lib/supabase/client";

/**
 * Rescata la sesión que Supabase deja en el fragmento de la URL.
 *
 * Los enlaces de invitación se generan con `admin.auth.admin.generateLink()`
 * desde el servidor, así que el navegador de quien los recibe nunca guardó
 * un verificador PKCE. Sin verificador Supabase no puede devolver `?code=`
 * para canjear: entrega la sesión ya hecha en el fragmento,
 * `/login#access_token=…&refresh_token=…`.
 *
 * El fragmento no viaja al servidor —el navegador lo retiene para sí y no
 * lo pone en la petición—, por eso /auth/callback, que corre en el
 * servidor, no lo ve: encuentra la query sin `code` y rebota a /login
 * arrastrando el `#`. Alguien tiene que leerlo en el navegador, y ese
 * alguien es este componente.
 *
 * Por el mismo camino llegan los fallos del enlace
 * (`#error=access_denied&error_code=otp_expired`), que sin esto también se
 * perdían y dejaban al usuario frente a un formulario de login mudo.
 */
export default function SesionEnFragmento() {
  const router = useRouter();

  // El fragmento se lee con useSyncExternalStore y no con useState porque
  // esta pantalla, aunque sea un Client Component, igual se prerenderiza en
  // el servidor, donde `window` no existe. El snapshot de servidor devuelve
  // null: React hidrata con el formulario tal como vino del servidor y
  // recién después mira la URL real del navegador, sin desajuste de
  // hidratación.
  const [lector] = useState(crearLectorDeFragmento);
  const fragmento = useSyncExternalStore(
    lector.suscribirse,
    lector.leer,
    lector.leerEnServidor,
  );

  const enlace = useMemo(() => interpretarFragmento(fragmento), [fragmento]);
  const [errorDeSesion, setErrorDeSesion] = useState<string | null>(null);

  useEffect(() => {
    if (enlace?.tipo !== "sesion") {
      // Un enlace fallido no tiene nada que canjear, pero su fragmento
      // igual se borra para que el error no quede pegado en la barra si
      // la persona recarga.
      if (enlace?.tipo === "error") limpiarFragmento();
      return;
    }

    // Se limpia antes de canjear, no después: los tokens son credenciales
    // completas y no queremos que queden en la barra de direcciones ni en
    // el historial, desde donde se copian y pegan sin pensarlo.
    limpiarFragmento();

    let vigente = true;

    void (async () => {
      const supabase = createClient();
      const { error } = await supabase.auth.setSession({
        access_token: enlace.accessToken,
        refresh_token: enlace.refreshToken,
      });

      if (!vigente) return;

      if (error) {
        setErrorDeSesion(traducirErrorDeSesion(error.message));
        return;
      }

      // Mismo patrón que update-password-form: replace y no push porque el
      // enlace ya se consumió y esta pantalla no debería quedar en el
      // historial, y refresh para tirar la caché del router y que las
      // pantallas que son Server Components se rendericen con la cookie de
      // sesión recién escrita.
      router.replace("/update-password");
      router.refresh();
    })();

    return () => {
      vigente = false;
    };
  }, [enlace, router]);

  // Sin fragmento no hay nada que resolver: la página se comporta como
  // cualquier visita normal a /login.
  if (!enlace) return null;

  if (enlace.tipo === "error") {
    return <Aviso mensaje={enlace.mensaje} />;
  }

  if (errorDeSesion) {
    return <Aviso mensaje={errorDeSesion} />;
  }

  // Tapa el formulario mientras se canjea. Si el login asomara aunque sea
  // un instante, la persona daría por fallado un enlace que está
  // funcionando y empezaría a escribir una contraseña que todavía no tiene.
  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-3 bg-background px-6">
      <p className="font-mono text-[11.5px] uppercase tracking-widest text-accent">
        Cotejo
      </p>
      <p
        className="text-[26px] font-medium text-ink"
        style={{ fontFamily: "var(--font-display)" }}
      >
        Validando tu enlace…
      </p>
      <p className="max-w-xs text-center text-sm leading-relaxed text-ink-soft">
        Un momento, estamos abriendo tu sesión.
      </p>
    </div>
  );
}

function Aviso({ mensaje }: { mensaje: string }) {
  return (
    <p className="mb-5 rounded-[10px] bg-critical-soft px-3.5 py-3 text-[13px] leading-relaxed text-critical">
      {mensaje}
    </p>
  );
}

type Enlace =
  | { tipo: "sesion"; accessToken: string; refreshToken: string }
  | { tipo: "error"; mensaje: string };

/**
 * Lector del fragmento, uno por montaje del componente.
 *
 * Congela lo que había en la URL la primera vez que lo miran. Si el
 * snapshot siguiera a `window.location.hash` en vivo, el replaceState que
 * borra los tokens lo dejaría vacío en el render siguiente y el componente
 * desaparecería en plena validación, devolviendo el formulario de login a
 * la vista. Al vivir en el estado del componente y no en el módulo, un
 * montaje posterior vuelve a leer la URL de ese momento en vez de arrastrar
 * un fragmento ya consumido.
 */
function crearLectorDeFragmento() {
  let congelado: string | null | undefined;

  return {
    leer(): string | null {
      congelado ??= window.location.hash.slice(1) || null;
      return congelado;
    },
    leerEnServidor(): string | null {
      return null;
    },
    suscribirse(): () => void {
      // El fragmento llega una sola vez, con la carga de la página: no hay
      // ninguna fuente externa a la que valga la pena suscribirse. React
      // igual pide la función, así que devolvemos una baja que no hace nada.
      return () => {};
    },
  };
}

function interpretarFragmento(fragmento: string | null): Enlace | null {
  if (!fragmento) return null;

  // El fragmento viene con el mismo formato que una query, así que
  // URLSearchParams lo decodifica tal cual: de paso convierte los `+` de
  // error_description en espacios, que es como Supabase escribe los textos.
  const params = new URLSearchParams(fragmento);

  const accessToken = params.get("access_token");
  const refreshToken = params.get("refresh_token");
  if (accessToken && refreshToken) {
    return { tipo: "sesion", accessToken, refreshToken };
  }

  const error = params.get("error");
  const codigo = params.get("error_code");
  const descripcion = params.get("error_description");
  if (error || codigo || descripcion) {
    return { tipo: "error", mensaje: traducirErrorDeEnlace(error, codigo, descripcion) };
  }

  // Hay fragmento, pero es de otra cosa (un ancla, por ejemplo).
  return null;
}

function limpiarFragmento() {
  // replaceState y no pushState: reescribe la entrada actual del historial
  // en vez de agregar otra, así el botón "atrás" no devuelve a la URL con
  // los tokens adentro.
  history.replaceState(
    null,
    "",
    `${window.location.pathname}${window.location.search}`,
  );
}

function traducirErrorDeEnlace(
  error: string | null,
  codigo: string | null,
  descripcion: string | null,
) {
  if (codigo === "otp_expired") {
    return "Ese enlace ya se usó o venció. Pide uno nuevo a un administrador.";
  }
  if (error === "access_denied") {
    return "No pudimos validar ese enlace. Pide uno nuevo a un administrador.";
  }
  // Para lo que no conocemos mostramos el texto de Supabase antes que un
  // mensaje genérico: es en inglés, pero al menos dice algo concreto.
  return (
    descripcion ??
    "No pudimos validar ese enlace. Pide uno nuevo a un administrador."
  );
}

function traducirErrorDeSesion(msg: string) {
  if (msg.includes("Refresh Token") || msg.includes("refresh_token")) {
    return "Ese enlace ya se usó o venció. Pide uno nuevo a un administrador.";
  }
  if (msg.includes("expired")) {
    return "Ese enlace venció. Pide uno nuevo a un administrador.";
  }
  return "No pudimos abrir tu sesión con ese enlace. Pide uno nuevo a un administrador.";
}
