

Simulación interactiva 3D basada en **Three.js r165** que modela un gemelo digital de una sala de servidores de alta densidad con renderizado PBR fotorrealista (Dark/Cyberpunk Elegante), máquina de estados termodinámica y dinámica de fluidos computacional (CFD) demostrativa de cálculo multivariable.

---

## 📐 Fundamentos Matemáticos y Físicos

| Concepto Matemático | Expresión Analítica | Interpretación Física en Datacenter |
|---|---|---|
| **Dominio Espacial $\Omega$** | $\Omega = [0, 10] \times [0, 15] \times [0, 3]\text{ m}$ | Volumen arquitectónico total: $\text{Vol}(\Omega) = \iiint_{\Omega} dV = 450\text{ m}^3$ |
| **Distribución Térmica $T(x,y,z)$** | $T(x,y,z) = 20 + z^2\text{ (°C)}$ | Estratificación vertical: 20°C en suelo ($z=0$) → 29°C crítico en techo ($z=3$) |
| **Teorema del Valor Medio** | $\bar{T} = \frac{1}{450}\iiint_{\Omega}(20+z^2)dV = \mathbf{23.0^\circ\text{C}}$ | Temperatura promedio volumétrica en régimen estacionario |
| **Campo Vectorial Convectivo** | $\vec{F}(x,y,z) = (0.5x,\, 0.2y,\, 1.5 + z)\text{ m/s}$ | Trayectoria de aceleración hacia las 5 campanas de extracción del techo |
| **Divergencia Volumétrica $\nabla \cdot \vec{F}$** | $\nabla \cdot \vec{F} = 0.5 + 0.2 + 1.0 = \mathbf{1.7} > 0$ | Expansión volumétrica neta del aire caliente hacia el pleno de extracción |

---

## 🏛️ 1. Renderizado PBR Fotorrealista (Dark/Cyberpunk Elegante)

- **Suelo Hiper-Reflectante**:
  - Implementado mediante `THREE.MeshStandardMaterial` (`metalness: 0.8`, `roughness: 0.15`), en carbón profundo (`#06070a`).
  - Textura procedural de baldosas técnicas elevadas registrables de 600×600 mm con juntas oscuras de alta precisión e insertos antiestáticos, reflejando de forma especular los racks y la iluminación sin sobrecarga de GPU.
- **Racks de Servidores PBR**:
  - 10 gabinetes (2 filas de 5 racks) en acero carbón oscuro (`metalness: 0.88`, `roughness: 0.22`) con postes estructurales de aluminio.
  - Puertas de vidrio templado ahumado (`MeshPhysicalMaterial`) con clearcoat y reflectividad de alto índice.
  - 14 blades por rack visibles tras el cristal, reflejando la distribución cuadrática $T(z) = 20 + z^2$.
- **LEDs de Procesamiento Asíncronos**:
  - 280 LEDs de cómputo instanciados en GPU (`THREE.InstancedMesh`, 1 draw call).
  - Parpadeo dinámico asíncrono modulado por funciones senoidales multi-armónicas ($\sin(\omega_1 t + \phi) + \sin(\omega_2 t + \phi \cdot 1.618)$) con desfases basados en la razón áurea para simular procesamiento continuo de algoritmos de Inteligencia Artificial.
  - Transición cromática dinámica: cian eléctrico (20°C) → ámbar (24.5°C) → rojo carmesí de sobrecarga (29°C).

---

## 🎮 2. Navegación 3D Libre (Symposium-Ready)

- Implementación con `THREE.OrbitControls` vía CDN oficial.
- Inercia orgánica (`enableDamping: true`, `dampingFactor: 0.05`) con sensación de peso y estabilidad cinematográfica, ideal para exposiciones y conferencias en vivo.
- Restricción angular polar estricta (`maxPolarAngle = π/2 - 0.035`), impidiendo físicamente que la cámara atraviese el suelo pulido.

---

## ❄️ 3. Máquina de Estados Termodinámica Reactiva

- **Fase de Calentamiento (HEATING)**:
  - Sistema de aire inactivo por defecto (opacidad cero).
  - Los servidores aumentan gradualmente su temperatura de 20.0°C a 29.0°C por disipación térmica algorítmica.
  - Emisión térmica roja cuadrática visible en el chasis y bahías superiores.
- **Disparo en Umbral Crítico (29.0°C)**:
  - Al alcanzar 29.0°C, el sistema HVAC se activa de inmediato cambiando a `COOLING`.
- **Fase de Extracción Reactiva (600 Streamlines CFD)**:
  - Se materializan **600 estelas aerodinámicas estilizadas** consolidadas en GPU (1 draw call, 60 FPS estables).
  - Trayectorias rigurosamente calculadas bajo el campo $\vec{F}(x,y,z) = (0.5x, 0.2y, 1.5 + z)$, acelerando verticalmente ($1.5 + z$) y expandiéndose demostrativamente según $\nabla \cdot \vec{F} = 1.7$ hacia los extractores del techo.
  - Descenso térmico rápido hasta 20.0°C; al enfriarse, las estelas se desvanecen suavemente, los indicadores retornan al cian/azul neutro y el ciclo recomienza.
- **Inmovilidad Geométrica**:
  - Cero rotaciones o traslaciones parásitas de objetos; el movimiento es 100% termodinámico y fluido-vectorial.

---

## ⚙️ 4. Optimización y Post-Procesamiento

- **Tone Mapping**: `THREE.ACESFilmicToneMapping` configurado con exposición 0.72 para garantizar negros absolutos, contraste de alta definición y evitar sobreexposiciones o pérdida de rango dinámico.
- **Bloom Calibrado**: `UnrealBloomPass` enfocado exclusivamente en luminarias LED, extractores y estelas vectoriales.
- **HUD Intacto**: Interfaz superpuesta con tipografía técnica y ecuaciones de Cálculo Multivariable.
- **Rendimiento**: 60 FPS sólidos en cualquier navegador moderno con WebGL 2.0 y soporte ES Modules.

---

## 🚀 Despliegue Local / Ejecución

Abre `index.html` en Google Chrome, Microsoft Edge, Firefox o Brave. No requiere Node.js ni compiladores:

```bash
# Ejemplo con servidor local Python (opcional)
python -m http.server 8000
# Abrir en navegador: http://localhost:8000
```
