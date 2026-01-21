const NexusApp = {
    state: {
        movimientos: [],
        recurrentes: [], 
        tabActual: 'movimientos',
        idActivo: null,
        filtroBusqueda: '',
        editandoId: null,
        saldosActuales: { ARS: 0, USD: 0 },
        gruposAbiertos: new Set(),
        diasAbiertos: new Set() // Para el acordeón de fechas
    },

    init() {
        this.cacheDOM();
        this.loadData();
        this.setDefaultDate();
        this.initListeners();
        this.procesarRecurrentes();
        this.renderAll();
    },

    cacheDOM() {
        this.dom = {
            cajaARS: document.getElementById('cajaReal'), cajaUSD: document.getElementById('cajaRealUSD'),
            deudaARS: document.getElementById('deudaARS'), deudaUSD: document.getElementById('deudaUSD'),
            historial: document.getElementById('historial'), desc: document.getElementById('desc'),
            monto: document.getElementById('monto'), fecha: document.getElementById('fechaManual'),
            tipo: document.getElementById('tipo'), divisa: document.getElementById('divisaRegistro'),
            estado: document.getElementById('estadoInicial'), busqueda: document.getElementById('busqueda'),
            ctxMenu: document.getElementById('custom-context-menu'), ctxList: document.getElementById('ctx-list'),
            panelTitle: document.getElementById('panelTitle'), btnGuardar: document.getElementById('btnGuardar'),
            btnCancel: document.getElementById('btnCancelarEdit'),
            alertaContenedor: document.getElementById('alertaContenedor'),
            listaRecurrentes: document.getElementById('listaRecurrentes')
        };
    },

    setDefaultDate() {
        const hoy = new Date().toISOString().split('T')[0];
        this.dom.fecha.value = hoy;
        if(document.getElementById('presFecha')) document.getElementById('presFecha').value = hoy;
        if(document.getElementById('cuotaFechaInicio')) document.getElementById('cuotaFechaInicio').value = hoy;
    },

    loadData() {
        this.state.movimientos = JSON.parse(localStorage.getItem('nexus_gold_v2_data')) || [];
        this.state.recurrentes = JSON.parse(localStorage.getItem('nexus_gold_v2_recurrentes')) || [];
    },

    initListeners() {
        window.addEventListener('click', () => this.dom.ctxMenu.classList.add('hidden'));
        window.addEventListener('contextmenu', (e) => {
            const item = e.target.closest('.history-item');
            if (item) {
                e.preventDefault();
                this.state.idActivo = parseInt(item.dataset.id);
                this.renderContextMenu(e.pageX, e.pageY);
            }
        });
        this.dom.busqueda.addEventListener('input', (e) => {
            this.state.filtroBusqueda = e.target.value.toLowerCase();
            this.renderHistorial();
        });
    },

    abrirModalRecurrentes() {
        this.renderRecurrentesList();
        this.abrirModal('modalRecurrente');
    },

    agregarRecurrente() {
        const d = document.getElementById('recDesc').value.toUpperCase();
        const m = parseFloat(document.getElementById('recMonto').value);
        const div = document.getElementById('recDivisa').value;

        if(!d || isNaN(m)) return;

        const nuevoRec = {
            id: Date.now(),
            desc: d,
            monto: m,
            divisa: div,
            ultimoMesProcesado: "" 
        };

        this.state.recurrentes.push(nuevoRec);
        document.getElementById('recDesc').value = '';
        document.getElementById('recMonto').value = '';
        
        this.syncRecurrentes();
        this.procesarRecurrentes();
        this.renderRecurrentesList();
    },

    eliminarRecurrente(id) {
        if(!confirm("¿Detener este pago mensual? Los registros ya creados se mantendrán.")) return;
        this.state.recurrentes = this.state.recurrentes.filter(r => r.id !== id);
        this.syncRecurrentes();
        this.renderRecurrentesList();
    },

    procesarRecurrentes() {
        const hoy = new Date();
        const mesActualKey = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}`;
        let cambios = false;

        this.state.recurrentes.forEach(rec => {
            if (rec.ultimoMesProcesado !== mesActualKey) {
                const fechaRegistro = `${mesActualKey}-05`; 
                
                this.state.movimientos.push({
                    id: Date.now() + Math.random(),
                    desc: `[FIJO] ${rec.desc}`,
                    monto: rec.monto,
                    tipo: 'gasto',
                    divisa: rec.divisa,
                    estado: 'adeudado',
                    fecha: fechaRegistro,
                    esPrestamo: false
                });

                rec.ultimoMesProcesado = mesActualKey;
                cambios = true;
            }
        });

        if (cambios) this.sync();
    },

    renderRecurrentesList() {
        if(!this.dom.listaRecurrentes) return;
        this.dom.listaRecurrentes.innerHTML = this.state.recurrentes.map(r => `
            <div class="flex justify-between items-center bg-white/5 p-3 rounded-xl border border-white/5">
                <div>
                    <p class="text-[10px] font-black text-white">${r.desc}</p>
                    <p class="text-[9px] text-blue-400 font-bold">${r.divisa} ${r.monto.toLocaleString()}/mes</p>
                </div>
                <button onclick="NexusApp.eliminarRecurrente(${r.id})" class="text-red-500 opacity-50 hover:opacity-100 p-2">
                    <i class="fas fa-times"></i>
                </button>
            </div>
        `).join('') || '<p class="text-[9px] text-center opacity-30 py-4">No hay pagos mensuales activos</p>';
    },

    syncRecurrentes() {
        localStorage.setItem('nexus_gold_v2_recurrentes', JSON.stringify(this.state.recurrentes));
    },

    renderContextMenu(x, y) {
        const mov = this.state.movimientos.find(m => m.id === this.state.idActivo);
        if(!mov) return;
        let html = `<li onclick="NexusApp.prepararEdicion(${mov.id})" class="text-blue-400"><i class="fas fa-edit"></i> EDITAR</li>
                    <li onclick="NexusApp.eliminarRegistro()" class="text-red-400"><i class="fas fa-trash"></i> BORRAR</li>`;
        if(mov.estado === 'adeudado') {
            html = `<li onclick="NexusApp.abrirPagoParcial(${mov.id})" class="text-green-400 font-bold"><i class="fas fa-check"></i> ABONAR/LIQUIDAR</li>` + html;
        }
        this.dom.ctxList.innerHTML = html;
        this.dom.ctxMenu.style.top = `${y}px`;
        this.dom.ctxMenu.style.left = `${x}px`;
        this.dom.ctxMenu.classList.remove('hidden');
    },

    guardarRegistro() {
        const d = this.dom.desc.value, m = parseFloat(this.dom.monto.value), f = this.dom.fecha.value;
        const tipo = this.dom.tipo.value, divisa = this.dom.divisa.value, estado = this.dom.estado.value;
        if(!d || isNaN(m) || !f) return;
        if(tipo === 'gasto' && estado === 'pagado') {
            if(m > this.state.saldosActuales[divisa]) {
                alert(`SALDO INSUFICIENTE EN CAJA ${divisa}`);
                return;
            }
        }
        if (this.state.editandoId) {
            const idx = this.state.movimientos.findIndex(x => x.id === this.state.editandoId);
            this.state.movimientos[idx] = { ...this.state.movimientos[idx], desc: d.toUpperCase(), monto: m, tipo: tipo, divisa: divisa, estado: estado, fecha: f };
            this.cancelarEdicion();
        } else {
            this.state.movimientos.push({ id: Date.now(), desc: d.toUpperCase(), monto: m, tipo: tipo, divisa: divisa, estado: estado, fecha: f, esPrestamo: false });
        }
        this.dom.desc.value = ''; this.dom.monto.value = '';
        this.sync();
    },

    registrarPrestamo() {
        const n = document.getElementById('presNombre').value.toUpperCase();
        const m = parseFloat(document.getElementById('presMonto').value);
        const f = document.getElementById('presFecha').value;
        const tipo = document.getElementById('presTipo').value, divisa = document.getElementById('presDivisa').value;
        if(!n || isNaN(m)) return;
        if(tipo === 'gasto' && m > this.state.saldosActuales[divisa]) {
            alert(`Saldo insuficiente en caja para prestar.`);
            return;
        }
        this.state.movimientos.push({ id: Date.now(), desc: `PRÉSTAMO: ${n}`, monto: m, tipo: tipo, divisa: divisa, estado: 'adeudado', fecha: f, esPrestamo: true });
        this.cerrarModal('modalPrestamo');
        this.sync();
    },

    registrarCuotas() {
        const desc = document.getElementById('cuotaDesc').value.toUpperCase();
        const montoCuota = parseFloat(document.getElementById('cuotaValorIndividual').value); 
        const cant = parseInt(document.getElementById('cuotaCantidad').value);
        const fechaInicio = document.getElementById('cuotaFechaInicio').value;
        const divisa = document.getElementById('cuotaDivisa').value;

        if (!desc || isNaN(montoCuota) || isNaN(cant) || cant <= 0) return;

        const grupoId = Date.now();
        let fechaBase = new Date(fechaInicio + "T00:00:00");

        for (let i = 1; i <= cant; i++) {
            const fStr = fechaBase.toISOString().split('T')[0];
            this.state.movimientos.push({
                id: grupoId + i,
                grupoId: grupoId,
                desc: `${desc} (CUOTA ${i}/${cant})`,
                monto: montoCuota,
                tipo: 'gasto',
                divisa: divisa,
                estado: 'adeudado',
                fecha: fStr,
                esPrestamo: false
            });
            fechaBase.setMonth(fechaBase.getMonth() + 1);
        }

        this.cerrarModal('modalCuotas');
        this.sync();
    },

    toggleGrupo(grupoId) {
        if (this.state.gruposAbiertos.has(grupoId)) {
            this.state.gruposAbiertos.delete(grupoId);
        } else {
            this.state.gruposAbiertos.add(grupoId);
        }
        this.renderHistorial();
    },

    toggleDia(fecha) {
        if (this.state.diasAbiertos.has(fecha)) {
            this.state.diasAbiertos.delete(fecha);
        } else {
            this.state.diasAbiertos.add(fecha);
        }
        this.renderHistorial();
    },

    abrirPagoParcial(id) {
        this.state.idActivo = id;
        const mov = this.state.movimientos.find(m => m.id === id);
        document.getElementById('pagoParcialInfo').innerText = `${mov.desc} (Deuda: ${mov.divisa} ${mov.monto.toLocaleString()})`;
        document.getElementById('montoPagoParcial').value = mov.monto;
        this.abrirModal('modalPagoParcial');
    },

    confirmarPagoParcial() {
        const montoAPagar = parseFloat(document.getElementById('montoPagoParcial').value);
        const movOriginal = this.state.movimientos.find(m => m.id === this.state.idActivo);
        if (!movOriginal || isNaN(montoAPagar) || montoAPagar <= 0) return;
        if (montoAPagar > this.state.saldosActuales[movOriginal.divisa]) {
            alert(`FONDOS INSUFICIENTES EN CAJA ${movOriginal.divisa}`);
            return;
        }
        this.state.movimientos.push({
            id: Date.now() + 1, desc: `PAGO: ${movOriginal.desc}`, monto: montoAPagar,
            tipo: 'gasto', divisa: movOriginal.divisa, estado: 'pagado', 
            fecha: new Date().toISOString().split('T')[0], vinculoId: movOriginal.id 
        });
        if (montoAPagar >= movOriginal.monto) { 
            movOriginal.monto = 0; movOriginal.estado = 'pagado'; movOriginal.esPrestamo = false; 
        } else { 
            movOriginal.monto -= montoAPagar; 
        }
        this.cerrarModal('modalPagoParcial');
        this.sync();
    },

    eliminarRegistro() {
        if(!confirm("¿Eliminar registro?")) return;
        const mov = this.state.movimientos.find(m => m.id === this.state.idActivo);
        if(mov && mov.vinculoId) {
            const padre = this.state.movimientos.find(m => m.id === mov.vinculoId);
            if(padre) { padre.monto += mov.monto; padre.estado = 'adeudado'; if(padre.desc.includes("PRÉSTAMO")) padre.esPrestamo = true; }
        }
        this.state.movimientos = this.state.movimientos.filter(m => m.id !== this.state.idActivo);
        this.sync();
    },

    renderStats() {
        let ars = 0, usd = 0, dARS = 0, dUSD = 0;
        this.state.movimientos.forEach(m => {
            if (m.estado === 'pagado' || m.esPrestamo) {
                if (m.divisa === 'ARS') { m.tipo === 'ingreso' ? ars += m.monto : ars -= m.monto; } 
                else { m.tipo === 'ingreso' ? usd += m.monto : usd -= m.monto; }
            }
            if (m.estado === 'adeudado') {
                if (m.divisa === 'ARS') dARS += m.monto; else dUSD += m.monto;
            }
        });
        this.state.saldosActuales = { ARS: ars, USD: usd };
        this.dom.cajaARS.innerText = `$ ${ars.toLocaleString()}`;
        this.dom.cajaUSD.innerText = `u$s ${usd.toLocaleString()}`;
        this.dom.deudaARS.innerText = `$ ${dARS.toLocaleString()}`;
        this.dom.deudaUSD.innerText = `u$s ${dUSD.toLocaleString()}`;
    },

    renderHistorial() {
        const hoy = new Date().toISOString().split('T')[0];
        let filtrados = [];
        
        if (this.state.tabActual === 'hoy') {
            filtrados = this.state.movimientos.filter(m => m.fecha === hoy);
        } else {
            filtrados = this.state.movimientos;
        }

        if (this.state.filtroBusqueda) {
            filtrados = filtrados.filter(m => m.desc.toLowerCase().includes(this.state.filtroBusqueda));
        }
        
        const ordenados = filtrados.sort((a,b) => b.fecha.localeCompare(a.fecha) || b.id - a.id);
        
        // Agrupar por fechas
        const gruposPorFecha = ordenados.reduce((acc, curr) => {
            if (!acc[curr.fecha]) acc[curr.fecha] = [];
            acc[curr.fecha].push(curr);
            return acc;
        }, {});

        let html = "";
        
        // Si es la pestaña "HOY", renderizamos directo sin acordeón de fecha
        if (this.state.tabActual === 'hoy') {
            html = this.renderContenidoLista(ordenados, hoy);
        } else {
            // Vista "TODO" agrupada por fechas
            Object.keys(gruposPorFecha).forEach(fecha => {
                const itemsDelDia = gruposPorFecha[fecha];
                const estaAbierto = this.state.diasAbiertos.has(fecha);
                const fechaLegible = fecha.split('-').reverse().join('/');
                const esHoy = fecha === hoy;

                html += `
                    <div class="day-group mb-4">
                        <div onclick="NexusApp.toggleDia('${fecha}')" class="flex items-center justify-between cursor-pointer p-3 bg-white/5 rounded-xl border border-white/5 hover:bg-white/10 transition-all mb-2">
                            <div class="flex items-center gap-3">
                                <i class="fas ${estaAbierto ? 'fa-chevron-down' : 'fa-chevron-right'} text-[10px] text-blue-500"></i>
                                <span class="text-[10px] font-black uppercase tracking-widest ${esHoy ? 'text-blue-400' : 'text-slate-400'}">
                                    ${esHoy ? 'HOY - ' : ''}${fechaLegible}
                                </span>
                            </div>
                            <span class="text-[9px] font-bold opacity-40">${itemsDelDia.length} REGISTROS</span>
                        </div>
                        <div class="${estaAbierto ? 'block' : 'hidden'} space-y-2 pl-2 border-l-2 border-white/5 ml-4">
                            ${this.renderContenidoLista(itemsDelDia, hoy)}
                        </div>
                    </div>
                `;
            });
        }

        this.dom.historial.innerHTML = html || '<div class="opacity-10 py-10 text-center text-xs">LISTA VACÍA</div>';
    },

    renderContenidoLista(lista, hoy) {
        let html = "";
        const gruposProcesados = new Set();

        lista.forEach(m => {
            if (m.grupoId && !gruposProcesados.has(m.grupoId)) {
                gruposProcesados.add(m.grupoId);
                const itemsGrupo = lista.filter(x => x.grupoId === m.grupoId);
                const montoCuota = itemsGrupo[0].monto; 
                const estaAbierto = this.state.gruposAbiertos.has(m.grupoId);
                const nombreBase = m.desc.split('(')[0].trim();

                html += `
                    <div class="group-container mb-2">
                        <div onclick="NexusApp.toggleGrupo(${m.grupoId})" class="history-item cursor-pointer border-l-4 border-yellow-500 bg-yellow-500/5">
                            <div class="flex items-center gap-3">
                                <i class="fas ${estaAbierto ? 'fa-chevron-down' : 'fa-chevron-right'} text-[8px] opacity-50"></i>
                                <div>
                                    <p class="text-[10px] font-black uppercase">${nombreBase} (PLAN CUOTAS)</p>
                                    <p class="text-[8px] opacity-30 font-bold">${itemsGrupo.filter(x => x.estado==='adeudado').length} PENDIENTES</p>
                                </div>
                            </div>
                            <span class="font-black text-[11px] text-yellow-500">
                                ${m.divisa === 'USD' ? 'u$s' : '$'} ${montoCuota.toLocaleString()} c/u
                            </span>
                        </div>
                        <div class="${estaAbierto ? 'block' : 'hidden'} ml-4 mt-1 space-y-1 border-l border-white/10 pl-2">
                            ${itemsGrupo.map(cuota => this.renderItemHTML(cuota, hoy)).join('')}
                        </div>
                    </div>
                `;
            } else if (!m.grupoId) {
                html += this.renderItemHTML(m, hoy);
            }
        });
        return html;
    },

    renderItemHTML(m, hoy) {
        return `
            <div class="history-item ${m.estado === 'adeudado' ? 'item-debt' : 'item-paid'}" data-id="${m.id}">
                <div>
                    <p class="text-[10px] font-black uppercase flex items-center gap-2">${m.desc} ${m.fecha > hoy ? '<i class="fas fa-clock text-blue-400"></i>' : ''}</p>
                    <p class="text-[8px] opacity-30 font-bold">${m.fecha.split('-').reverse().join('/')}</p>
                </div>
                <div class="flex items-center gap-3">
                    <span class="font-black text-[11px] ${m.tipo === 'ingreso' ? 'text-green-400' : 'text-red-400'}">
                        ${m.tipo === 'ingreso' ? '+' : '-'} ${m.divisa === 'USD' ? 'u$s' : '$'} ${m.monto.toLocaleString()}
                    </span>
                    <div class="flex gap-1 border-l border-white/5 pl-2">
                        <button onclick="NexusApp.prepararEdicion(${m.id})" class="mini-action-btn text-blue-400"><i class="fas fa-edit"></i></button>
                        ${m.estado === 'adeudado' ? `<button onclick="NexusApp.abrirPagoParcial(${m.id})" class="mini-action-btn text-green-400"><i class="fas fa-check"></i></button>` : ''}
                        <button onclick="NexusApp.state.idActivo=${m.id}; NexusApp.eliminarRegistro()" class="mini-action-btn text-red-400"><i class="fas fa-trash"></i></button>
                    </div>
                </div>
            </div>`;
    },

    verificarVencimientos() {
        const mañana = new Date(); mañana.setDate(mañana.getDate() + 1);
        const mañanaISO = mañana.toISOString().split('T')[0];
        const deudas = this.state.movimientos.filter(m => m.estado === 'adeudado' && m.fecha === mañanaISO);
        
        if (deudas.length > 0) {
            const totalARS = deudas.filter(d => d.divisa === 'ARS').reduce((acc, curr) => acc + curr.monto, 0);
            const totalUSD = deudas.filter(d => d.divisa === 'USD').reduce((acc, curr) => acc + curr.monto, 0);
            
            let montosTexto = "";
            if(totalARS > 0) montosTexto += ` $${totalARS.toLocaleString()} `;
            if(totalUSD > 0) montosTexto += ` u$s${totalUSD.toLocaleString()} `;

            this.dom.alertaContenedor.innerHTML = `
                <div class="bg-orange-500/10 border border-orange-500/20 p-4 rounded-xl mb-4 flex justify-between items-center animate-pulse">
                    <div class="flex items-center gap-3">
                        <i class="fas fa-exclamation-triangle text-orange-500 text-lg"></i>
                        <div>
                            <span class="text-[9px] font-black uppercase text-orange-400 block mb-1">PRÓXIMOS VENCIMIENTOS (MAÑANA)</span>
                            <span class="text-white font-black text-xs">Total a pagar:${montosTexto}</span>
                        </div>
                    </div>
                    <button onclick="NexusApp.filtrarVencimientos('${mañanaISO}')" class="bg-orange-500 text-white text-[9px] font-black px-3 py-2 rounded-lg hover:bg-orange-400 transition-colors">VER DETALLES</button>
                </div>`;
        } else { this.dom.alertaContenedor.innerHTML = ''; }
    },

    filtrarVencimientos(fecha) {
        this.cambiarTab('movimientos');
        this.state.filtroBusqueda = "";
        this.dom.busqueda.value = "";
        const filtrados = this.state.movimientos.filter(m => m.fecha === fecha && m.estado === 'adeudado');
        this.renderHistorialConFiltro(filtrados);
    },

    renderHistorialConFiltro(lista) {
        this.dom.historial.innerHTML = lista.map(m => `
            <div class="history-item item-debt" data-id="${m.id}">
                <div><p class="text-[10px] font-black uppercase text-white">${m.desc}</p></div>
                <div class="flex items-center gap-3">
                    <span class="font-black text-[11px] text-red-400">${m.divisa === 'USD' ? 'u$s' : '$'} ${m.monto.toLocaleString()}</span>
                    <button onclick="NexusApp.abrirPagoParcial(${m.id})" class="mini-action-btn text-green-400"><i class="fas fa-check"></i></button>
                </div>
            </div>`).join('') + `<button onclick="NexusApp.renderAll()" class="btn-secondary-modern mt-4">VOLVER AL HISTORIAL COMPLETO</button>`;
    },

    prepararEdicion(id) {
        const mov = this.state.movimientos.find(m => m.id === id);
        if (!mov) return;
        this.state.editandoId = id;
        this.dom.desc.value = mov.desc; this.dom.monto.value = mov.monto;
        this.dom.fecha.value = mov.fecha; this.dom.tipo.value = mov.tipo;
        this.dom.divisa.value = mov.divisa; this.dom.estado.value = mov.estado;
        this.dom.panelTitle.innerText = "Editando Registro";
        this.dom.btnGuardar.innerText = "CONFIRMAR CAMBIOS";
        this.dom.btnCancel.classList.remove('hidden');
    },

    cancelarEdicion() {
        this.state.editandoId = null;
        this.dom.panelTitle.innerText = "Nueva Operación";
        this.dom.btnGuardar.innerText = "REGISTRAR EN NEXUS";
        this.dom.btnCancel.classList.add('hidden');
        this.dom.desc.value = ''; this.dom.monto.value = ''; this.setDefaultDate();
    },

    sync() { localStorage.setItem('nexus_gold_v2_data', JSON.stringify(this.state.movimientos)); this.renderAll(); },
    renderAll() { this.renderStats(); this.renderHistorial(); this.verificarVencimientos(); },
    cambiarTab(t) { this.state.tabActual = t; document.querySelectorAll('.tab-btn-modern').forEach(b => b.classList.toggle('active', b.id === `tab-nav-${t}`)); this.renderAll(); },
    abrirModal(id) { document.getElementById(id).style.display = 'flex'; },
    cerrarModal(id) { document.getElementById(id).style.display = 'none'; }
};
document.addEventListener('DOMContentLoaded', () => NexusApp.init());
