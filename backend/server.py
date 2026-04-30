from dotenv import load_dotenv
from pathlib import Path

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

import os
import io
import uuid
import logging
import bcrypt
import jwt
from datetime import datetime, timezone, timedelta
from typing import List, Optional, Literal

from fastapi import FastAPI, APIRouter, HTTPException, Depends, Request, Query
from fastapi.responses import StreamingResponse
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, Field, EmailStr, ConfigDict

from reportlab.lib.pagesizes import A4, landscape
from reportlab.lib import colors
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import mm
from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer, Image as RLImage

# ---------- Setup ----------
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

JWT_SECRET = os.environ['JWT_SECRET']
JWT_ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_HOURS = 24

app = FastAPI(title="AJVJ Fitosanidad API")
api = APIRouter(prefix="/api")
security = HTTPBearer(auto_error=False)

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger("ajvj")

# ---------- Helpers ----------
def hash_password(p: str) -> str:
    return bcrypt.hashpw(p.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")

def verify_password(p: str, h: str) -> bool:
    try:
        return bcrypt.checkpw(p.encode("utf-8"), h.encode("utf-8"))
    except Exception:
        return False

def create_token(user_id: str, email: str, rol: str) -> str:
    payload = {
        "sub": user_id, "email": email, "rol": rol,
        "exp": datetime.now(timezone.utc) + timedelta(hours=ACCESS_TOKEN_EXPIRE_HOURS),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)

def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()

def new_id() -> str:
    return str(uuid.uuid4())

async def get_current_user(creds: Optional[HTTPAuthorizationCredentials] = Depends(security)) -> dict:
    if creds is None or not creds.credentials:
        raise HTTPException(status_code=401, detail="No autenticado")
    try:
        payload = jwt.decode(creds.credentials, JWT_SECRET, algorithms=[JWT_ALGORITHM])
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expirado")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Token inválido")
    user = await db.users.find_one({"id": payload["sub"]}, {"_id": 0, "password_hash": 0})
    if not user:
        raise HTTPException(status_code=401, detail="Usuario no encontrado")
    return user

def require_admin(user: dict = Depends(get_current_user)) -> dict:
    if user.get("rol") != "admin":
        raise HTTPException(status_code=403, detail="Se requiere rol admin")
    return user

# ---------- Models ----------
class UserCreate(BaseModel):
    email: EmailStr
    password: str
    nombre: str
    rol: Literal["admin", "monitor", "jefe"] = "monitor"

class UserOut(BaseModel):
    id: str
    email: str
    nombre: str
    rol: str
    creado_en: str

class LoginIn(BaseModel):
    email: EmailStr
    password: str

class TokenOut(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserOut

class ConfigDoc(BaseModel):
    empresa: str = "AJVJ Hidropónicos"
    razon_social: str = "AJVJ Hidropónicos SPR DE RI DE CV"
    asesor: str = ""
    jefe_produccion: str = ""
    objetivos: List[str] = []
    categorias_producto: List[str] = []

class CicloIn(BaseModel):
    numero: int  # 1 o 2
    cultivo: str = ""
    variedad: str = ""
    num_plantas: float = 0
    superficie_m2: float = 0
    caldo_foliar_L: float = 0
    fecha_trasplante: Optional[str] = None
    fecha_inicio: Optional[str] = None
    fecha_fin: Optional[str] = None
    activo: bool = True

class ModuloIn(BaseModel):
    nombre: str
    ciclos: List[CicloIn] = []

class ModuloOut(ModuloIn):
    id: str

class ProductoIn(BaseModel):
    nombre: str
    categoria: str = ""
    dosis_habitual: float = 0
    unidad_habitual: str = "L"
    precio_unitario: float = 0
    notas: str = ""

class ProductoOut(ProductoIn):
    id: str

class ProductoAplicado(BaseModel):
    producto_id: str
    nombre: str
    dosis: float
    unidad: str  # mL/L, L/ha, mL/planta, L/planta, L
    cantidad_usada_total: float  # in product base unit
    costo_linea: float
    precio_unitario: float = 0

class AplicacionIn(BaseModel):
    tipo: Literal["foliar", "suelo", "drench", "riego"]
    objetivo: str
    productos: List[ProductoAplicado]
    costo_total_aplicacion: float = 0

class BitacoraIn(BaseModel):
    fecha: str  # ISO date
    semana_inicio: Optional[str] = None
    tipo: Literal["semanal", "individual"] = "individual"
    modulo_id: str
    ciclo_numero: int
    asesor: str = ""
    monitor: str = ""
    aplicaciones: List[AplicacionIn]
    notas: str = ""

class BitacoraOut(BitacoraIn):
    id: str
    costo_total_bitacora: float
    guardada_en: str
    creado_por: Optional[str] = None

class CompraIn(BaseModel):
    fecha: str
    producto_id: str
    nombre_producto: str
    cantidad: float
    unidad: str
    precio_unitario: float
    proveedor: str = ""
    notas: str = ""

class CompraOut(CompraIn):
    id: str
    precio_total: float
    creado_por: str
    creado_en: str

class AjusteInventarioIn(BaseModel):
    producto_id: str
    nueva_cantidad: float
    justificacion: str = ""

class PedidoQueryIn(BaseModel):
    fecha_inicio: str
    fecha_fin: str
    modulo_ids: List[str] = []  # empty = todos

# ---------- Auth Endpoints ----------
@api.post("/auth/login", response_model=TokenOut)
async def login(payload: LoginIn):
    email = payload.email.lower().strip()
    user = await db.users.find_one({"email": email})
    if not user or not verify_password(payload.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Credenciales inválidas")
    token = create_token(user["id"], user["email"], user["rol"])
    return TokenOut(
        access_token=token,
        user=UserOut(id=user["id"], email=user["email"], nombre=user["nombre"], rol=user["rol"], creado_en=user["creado_en"]),
    )

@api.get("/auth/me", response_model=UserOut)
async def auth_me(user: dict = Depends(get_current_user)):
    return UserOut(**user)

# ---------- Users (admin) ----------
@api.get("/users", response_model=List[UserOut])
async def list_users(_: dict = Depends(require_admin)):
    items = await db.users.find({}, {"_id": 0, "password_hash": 0}).sort("creado_en", -1).to_list(500)
    return items

@api.post("/users", response_model=UserOut)
async def create_user(payload: UserCreate, _: dict = Depends(require_admin)):
    email = payload.email.lower().strip()
    if await db.users.find_one({"email": email}):
        raise HTTPException(status_code=400, detail="Ya existe un usuario con ese email")
    u = {
        "id": new_id(),
        "email": email,
        "password_hash": hash_password(payload.password),
        "nombre": payload.nombre,
        "rol": payload.rol,
        "creado_en": now_iso(),
    }
    await db.users.insert_one(u)
    return UserOut(id=u["id"], email=u["email"], nombre=u["nombre"], rol=u["rol"], creado_en=u["creado_en"])

@api.delete("/users/{user_id}")
async def delete_user(user_id: str, current: dict = Depends(require_admin)):
    if user_id == current["id"]:
        raise HTTPException(status_code=400, detail="No puedes eliminar tu propio usuario")
    await db.users.delete_one({"id": user_id})
    return {"ok": True}

# ---------- Config ----------
@api.get("/config", response_model=ConfigDoc)
async def get_config(_: dict = Depends(get_current_user)):
    cfg = await db.config.find_one({"id": "main"}, {"_id": 0, "id": 0})
    if not cfg:
        cfg = ConfigDoc().model_dump()
    return ConfigDoc(**cfg)

@api.put("/config", response_model=ConfigDoc)
async def put_config(payload: ConfigDoc, _: dict = Depends(require_admin)):
    doc = payload.model_dump()
    doc["id"] = "main"
    await db.config.update_one({"id": "main"}, {"$set": doc}, upsert=True)
    return payload

# ---------- Modulos ----------
@api.get("/modulos", response_model=List[ModuloOut])
async def list_modulos(_: dict = Depends(get_current_user)):
    items = await db.modulos.find({}, {"_id": 0}).sort("nombre", 1).to_list(100)
    return items

@api.post("/modulos", response_model=ModuloOut)
async def create_modulo(payload: ModuloIn, _: dict = Depends(require_admin)):
    if await db.modulos.find_one({"nombre": payload.nombre}):
        raise HTTPException(status_code=400, detail="Ya existe un módulo con ese nombre")
    doc = payload.model_dump()
    doc["id"] = new_id()
    await db.modulos.insert_one(doc.copy())
    return ModuloOut(**doc)

@api.put("/modulos/{modulo_id}", response_model=ModuloOut)
async def update_modulo(modulo_id: str, payload: ModuloIn, _: dict = Depends(require_admin)):
    doc = payload.model_dump()
    doc["id"] = modulo_id
    res = await db.modulos.update_one({"id": modulo_id}, {"$set": doc})
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Módulo no encontrado")
    return ModuloOut(**doc)

@api.delete("/modulos/{modulo_id}")
async def delete_modulo(modulo_id: str, _: dict = Depends(require_admin)):
    await db.modulos.delete_one({"id": modulo_id})
    return {"ok": True}

# ---------- Productos ----------
@api.get("/productos", response_model=List[ProductoOut])
async def list_productos(_: dict = Depends(get_current_user)):
    items = await db.productos.find({}, {"_id": 0}).sort("nombre", 1).to_list(2000)
    return items

@api.post("/productos", response_model=ProductoOut)
async def create_producto(payload: ProductoIn, _: dict = Depends(require_admin)):
    doc = payload.model_dump()
    doc["id"] = new_id()
    await db.productos.insert_one(doc.copy())
    # asegurar que existe inventario
    await db.inventario.update_one(
        {"producto_id": doc["id"]},
        {"$setOnInsert": {
            "producto_id": doc["id"], "nombre": doc["nombre"],
            "cantidad": 0, "unidad": doc["unidad_habitual"],
            "ultima_actualizacion": now_iso(),
        }},
        upsert=True,
    )
    return ProductoOut(**doc)

@api.put("/productos/{producto_id}", response_model=ProductoOut)
async def update_producto(producto_id: str, payload: ProductoIn, _: dict = Depends(require_admin)):
    doc = payload.model_dump()
    doc["id"] = producto_id
    res = await db.productos.update_one({"id": producto_id}, {"$set": doc})
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Producto no encontrado")
    await db.inventario.update_one({"producto_id": producto_id}, {"$set": {"nombre": doc["nombre"]}})
    return ProductoOut(**doc)

@api.delete("/productos/{producto_id}")
async def delete_producto(producto_id: str, _: dict = Depends(require_admin)):
    await db.productos.delete_one({"id": producto_id})
    await db.inventario.delete_one({"producto_id": producto_id})
    return {"ok": True}

# ---------- Inventario ----------
@api.get("/inventario")
async def list_inventario(_: dict = Depends(get_current_user)):
    items = await db.inventario.find({}, {"_id": 0}).sort("nombre", 1).to_list(2000)
    return items

@api.get("/inventario/{producto_id}/movimientos")
async def list_movimientos(producto_id: str, _: dict = Depends(get_current_user)):
    items = await db.movimientos.find({"producto_id": producto_id}, {"_id": 0}).sort("fecha", -1).to_list(500)
    return items

@api.post("/inventario/ajuste")
async def ajuste_manual(payload: AjusteInventarioIn, user: dict = Depends(require_admin)):
    inv = await db.inventario.find_one({"producto_id": payload.producto_id}, {"_id": 0})
    if not inv:
        raise HTTPException(status_code=404, detail="Producto no encontrado en inventario")
    diff = payload.nueva_cantidad - inv["cantidad"]
    await db.inventario.update_one(
        {"producto_id": payload.producto_id},
        {"$set": {"cantidad": payload.nueva_cantidad, "ultima_actualizacion": now_iso()}},
    )
    await db.movimientos.insert_one({
        "id": new_id(),
        "tipo": "ajuste",
        "producto_id": payload.producto_id,
        "nombre_producto": inv["nombre"],
        "cantidad": diff,
        "unidad": inv["unidad"],
        "referencia": "ajuste_manual",
        "justificacion": payload.justificacion,
        "fecha": now_iso(),
        "usuario": user["email"],
    })
    return {"ok": True, "nueva_cantidad": payload.nueva_cantidad}

# ---------- Compras ----------
@api.get("/compras", response_model=List[CompraOut])
async def list_compras(_: dict = Depends(get_current_user)):
    items = await db.compras.find({}, {"_id": 0}).sort("fecha", -1).to_list(2000)
    return items

@api.post("/compras", response_model=CompraOut)
async def create_compra(payload: CompraIn, user: dict = Depends(get_current_user)):
    doc = payload.model_dump()
    doc["id"] = new_id()
    doc["precio_total"] = round(payload.cantidad * payload.precio_unitario, 4)
    doc["creado_por"] = user["email"]
    doc["creado_en"] = now_iso()
    await db.compras.insert_one(doc.copy())
    # Sumar al inventario
    inv = await db.inventario.find_one({"producto_id": payload.producto_id}, {"_id": 0})
    if inv:
        nueva = inv["cantidad"] + payload.cantidad
        await db.inventario.update_one(
            {"producto_id": payload.producto_id},
            {"$set": {"cantidad": nueva, "unidad": payload.unidad, "ultima_actualizacion": now_iso()}},
        )
    else:
        await db.inventario.insert_one({
            "producto_id": payload.producto_id,
            "nombre": payload.nombre_producto,
            "cantidad": payload.cantidad,
            "unidad": payload.unidad,
            "ultima_actualizacion": now_iso(),
        })
    await db.movimientos.insert_one({
        "id": new_id(),
        "tipo": "entrada",
        "producto_id": payload.producto_id,
        "nombre_producto": payload.nombre_producto,
        "cantidad": payload.cantidad,
        "unidad": payload.unidad,
        "referencia": f"compra:{doc['id']}",
        "fecha": doc["fecha"],
        "usuario": user["email"],
    })
    # Actualiza precio del producto
    await db.productos.update_one(
        {"id": payload.producto_id},
        {"$set": {"precio_unitario": payload.precio_unitario}},
    )
    return CompraOut(**doc)

@api.delete("/compras/{compra_id}")
async def delete_compra(compra_id: str, _: dict = Depends(require_admin)):
    compra = await db.compras.find_one({"id": compra_id}, {"_id": 0})
    if not compra:
        raise HTTPException(status_code=404, detail="Compra no encontrada")
    # revertir inventario
    inv = await db.inventario.find_one({"producto_id": compra["producto_id"]}, {"_id": 0})
    if inv:
        await db.inventario.update_one(
            {"producto_id": compra["producto_id"]},
            {"$set": {"cantidad": inv["cantidad"] - compra["cantidad"], "ultima_actualizacion": now_iso()}},
        )
    await db.movimientos.delete_many({"referencia": f"compra:{compra_id}"})
    await db.compras.delete_one({"id": compra_id})
    return {"ok": True}

# ---------- Bitácoras ----------
@api.get("/bitacoras", response_model=List[BitacoraOut])
async def list_bitacoras(
    modulo_id: Optional[str] = None,
    ciclo_numero: Optional[int] = None,
    cultivo: Optional[str] = None,
    producto_id: Optional[str] = None,
    fecha_inicio: Optional[str] = None,
    fecha_fin: Optional[str] = None,
    _: dict = Depends(get_current_user),
):
    q: dict = {}
    if modulo_id:
        q["modulo_id"] = modulo_id
    if ciclo_numero is not None:
        q["ciclo_numero"] = ciclo_numero
    if producto_id:
        q["aplicaciones.productos.producto_id"] = producto_id
    if fecha_inicio or fecha_fin:
        q["fecha"] = {}
        if fecha_inicio:
            q["fecha"]["$gte"] = fecha_inicio
        if fecha_fin:
            q["fecha"]["$lte"] = fecha_fin
    items = await db.bitacoras.find(q, {"_id": 0}).sort("fecha", -1).to_list(2000)
    if cultivo:
        # filtrar por cultivo del módulo+ciclo (post-fetch)
        modulos = {m["id"]: m for m in await db.modulos.find({}, {"_id": 0}).to_list(100)}
        filt = []
        for b in items:
            m = modulos.get(b["modulo_id"])
            if not m:
                continue
            ciclo = next((c for c in m.get("ciclos", []) if c.get("numero") == b.get("ciclo_numero")), None)
            if ciclo and (ciclo.get("cultivo", "").lower() == cultivo.lower()):
                filt.append(b)
        items = filt
    return items

@api.post("/bitacoras", response_model=BitacoraOut)
async def create_bitacora(payload: BitacoraIn, user: dict = Depends(get_current_user)):
    bit_id = new_id()
    # calcular costo_total_bitacora
    costo_total = 0.0
    aplicaciones = []
    for ap in payload.aplicaciones:
        ap_total = 0.0
        prods_out = []
        for p in ap.productos:
            ap_total += p.costo_linea
            prods_out.append(p.model_dump())
        ap_dict = ap.model_dump()
        ap_dict["costo_total_aplicacion"] = round(ap_total, 4)
        aplicaciones.append(ap_dict)
        costo_total += ap_total

    doc = payload.model_dump()
    doc["id"] = bit_id
    doc["aplicaciones"] = aplicaciones
    doc["costo_total_bitacora"] = round(costo_total, 4)
    doc["guardada_en"] = now_iso()
    doc["creado_por"] = user["email"]

    await db.bitacoras.insert_one(doc.copy())

    # descuento de inventario por cada producto
    for ap in aplicaciones:
        for p in ap["productos"]:
            inv = await db.inventario.find_one({"producto_id": p["producto_id"]}, {"_id": 0})
            cantidad = float(p["cantidad_usada_total"])
            if inv:
                nueva = inv["cantidad"] - cantidad
                await db.inventario.update_one(
                    {"producto_id": p["producto_id"]},
                    {"$set": {"cantidad": nueva, "ultima_actualizacion": now_iso()}},
                )
            else:
                await db.inventario.insert_one({
                    "producto_id": p["producto_id"],
                    "nombre": p["nombre"],
                    "cantidad": -cantidad,
                    "unidad": p["unidad"],
                    "ultima_actualizacion": now_iso(),
                })
            await db.movimientos.insert_one({
                "id": new_id(),
                "tipo": "salida",
                "producto_id": p["producto_id"],
                "nombre_producto": p["nombre"],
                "cantidad": cantidad,
                "unidad": p["unidad"],
                "referencia": f"bitacora:{bit_id}",
                "fecha": doc["fecha"],
                "usuario": user["email"],
            })
    return BitacoraOut(**doc)

@api.get("/bitacoras/{bit_id}", response_model=BitacoraOut)
async def get_bitacora(bit_id: str, _: dict = Depends(get_current_user)):
    b = await db.bitacoras.find_one({"id": bit_id}, {"_id": 0})
    if not b:
        raise HTTPException(status_code=404, detail="Bitácora no encontrada")
    return b

@api.delete("/bitacoras/{bit_id}")
async def delete_bitacora(bit_id: str, _: dict = Depends(require_admin)):
    b = await db.bitacoras.find_one({"id": bit_id}, {"_id": 0})
    if not b:
        raise HTTPException(status_code=404, detail="Bitácora no encontrada")
    # revertir inventario
    movs = await db.movimientos.find({"referencia": f"bitacora:{bit_id}"}, {"_id": 0}).to_list(2000)
    for m in movs:
        inv = await db.inventario.find_one({"producto_id": m["producto_id"]}, {"_id": 0})
        if inv:
            await db.inventario.update_one(
                {"producto_id": m["producto_id"]},
                {"$set": {"cantidad": inv["cantidad"] + m["cantidad"], "ultima_actualizacion": now_iso()}},
            )
    await db.movimientos.delete_many({"referencia": f"bitacora:{bit_id}"})
    await db.bitacoras.delete_one({"id": bit_id})
    return {"ok": True}

# ---------- Pedidos ----------
async def _calcular_pedido(fecha_inicio: str, fecha_fin: str, modulo_ids: List[str]):
    q: dict = {"fecha": {"$gte": fecha_inicio, "$lte": fecha_fin}}
    if modulo_ids:
        q["modulo_id"] = {"$in": modulo_ids}
    bitacoras = await db.bitacoras.find(q, {"_id": 0}).to_list(5000)

    requerido: dict = {}  # producto_id -> cantidad total requerida
    for b in bitacoras:
        for ap in b.get("aplicaciones", []):
            for p in ap.get("productos", []):
                pid = p["producto_id"]
                requerido.setdefault(pid, {
                    "producto_id": pid, "nombre": p["nombre"], "unidad": p["unidad"],
                    "necesito": 0.0, "precio_unitario": p.get("precio_unitario", 0),
                })
                requerido[pid]["necesito"] += float(p["cantidad_usada_total"])

    # añadir productos del catálogo que no estén en bitácoras (con necesito=0) -> no incluir
    inventario = {i["producto_id"]: i for i in await db.inventario.find({}, {"_id": 0}).to_list(2000)}
    productos_cat = {p["id"]: p for p in await db.productos.find({}, {"_id": 0}).to_list(2000)}

    rows = []
    for pid, r in requerido.items():
        inv = inventario.get(pid, {"cantidad": 0, "unidad": r["unidad"]})
        cat = productos_cat.get(pid, {})
        diff = r["necesito"] - inv.get("cantidad", 0)
        precio = cat.get("precio_unitario", r.get("precio_unitario", 0)) or 0
        rows.append({
            "producto_id": pid,
            "nombre": r["nombre"],
            "categoria": cat.get("categoria", ""),
            "unidad": r["unidad"],
            "necesito": round(r["necesito"], 4),
            "tengo": round(inv.get("cantidad", 0), 4),
            "diferencia": round(diff, 4),
            "cantidad_a_pedir": round(max(diff, 0), 4),
            "precio_unitario": precio,
            "total_estimado": round(max(diff, 0) * precio, 2),
        })
    rows.sort(key=lambda x: (x["categoria"], x["nombre"]))
    return rows

@api.post("/pedidos/calcular")
async def calcular_pedido(payload: PedidoQueryIn, _: dict = Depends(get_current_user)):
    rows = await _calcular_pedido(payload.fecha_inicio, payload.fecha_fin, payload.modulo_ids)
    total = sum(r["total_estimado"] for r in rows)
    return {"items": rows, "total_general": round(total, 2)}

@api.post("/pedidos/pdf")
async def pedido_pdf(payload: PedidoQueryIn, user: dict = Depends(get_current_user)):
    rows = await _calcular_pedido(payload.fecha_inicio, payload.fecha_fin, payload.modulo_ids)
    rows = [r for r in rows if r["cantidad_a_pedir"] > 0]
    cfg = await db.config.find_one({"id": "main"}, {"_id": 0, "id": 0}) or {}
    modulos_q = await db.modulos.find({"id": {"$in": payload.modulo_ids}} if payload.modulo_ids else {}, {"_id": 0}).to_list(100)
    modulos_str = ", ".join(m["nombre"] for m in modulos_q) if modulos_q else "Todos los módulos"

    buf = io.BytesIO()
    doc = SimpleDocTemplate(
        buf, pagesize=A4,
        leftMargin=15 * mm, rightMargin=15 * mm,
        topMargin=15 * mm, bottomMargin=15 * mm,
        title="Orden de Requerimiento AJVJ",
    )
    styles = getSampleStyleSheet()
    brand_dark = colors.HexColor("#4B5828")
    brand_accent = colors.HexColor("#8FAD3C")
    brand_cream = colors.HexColor("#C8D4A0")

    title_style = ParagraphStyle("title", parent=styles["Title"], textColor=brand_dark, fontSize=18, alignment=0, spaceAfter=4)
    subtitle_style = ParagraphStyle("sub", parent=styles["Normal"], textColor=brand_accent, fontSize=11, spaceAfter=2)
    small = ParagraphStyle("small", parent=styles["Normal"], fontSize=9, textColor=colors.black)
    elements = []

    # Header
    header_data = [[
        Paragraph(f'<font color="#4B5828"><b>AJVJ</b></font> <font color="#8FAD3C"><b>HIDROPÓNICOS</b></font>', ParagraphStyle("logo", fontSize=22, leading=24)),
        Paragraph(f'<para align="right"><b>Orden de Requerimiento de Agroquímicos</b><br/>{cfg.get("razon_social","AJVJ Hidropónicos SPR DE RI DE CV")}<br/>Generado: {datetime.now().strftime("%d/%m/%Y %H:%M")}</para>', small),
    ]]
    header_tbl = Table(header_data, colWidths=[80 * mm, 100 * mm])
    header_tbl.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("LINEBELOW", (0, 0), (-1, -1), 2, brand_dark),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
    ]))
    elements.append(header_tbl)
    elements.append(Spacer(1, 8))
    elements.append(Paragraph(f"<b>Período:</b> {payload.fecha_inicio} a {payload.fecha_fin}", small))
    elements.append(Paragraph(f"<b>Módulos:</b> {modulos_str}", small))
    elements.append(Spacer(1, 10))

    # Tabla
    table_header = ["Producto", "Categoría", "Unidad", "Necesito", "Stock", "A pedir", "P. Unit.", "Total"]
    table_data = [table_header]
    cats_subtotal: dict = {}
    total_general = 0.0
    for r in rows:
        table_data.append([
            r["nombre"], r["categoria"] or "—", r["unidad"],
            f'{r["necesito"]:.2f}', f'{r["tengo"]:.2f}', f'{r["cantidad_a_pedir"]:.2f}',
            f'${r["precio_unitario"]:.2f}', f'${r["total_estimado"]:.2f}',
        ])
        cats_subtotal.setdefault(r["categoria"] or "Sin categoría", 0.0)
        cats_subtotal[r["categoria"] or "Sin categoría"] += r["total_estimado"]
        total_general += r["total_estimado"]

    if len(table_data) == 1:
        table_data.append(["Sin productos requeridos en el período", "", "", "", "", "", "", ""])

    tbl = Table(table_data, repeatRows=1, colWidths=[40 * mm, 28 * mm, 18 * mm, 18 * mm, 18 * mm, 18 * mm, 18 * mm, 22 * mm])
    tbl.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), brand_dark),
        ("TEXTCOLOR", (0, 0), (-1, 0), brand_cream),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, -1), 8),
        ("ALIGN", (3, 1), (-1, -1), "RIGHT"),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#F5F5F0")]),
        ("GRID", (0, 0), (-1, -1), 0.25, colors.HexColor("#e5e7eb")),
        ("BOTTOMPADDING", (0, 0), (-1, 0), 6),
        ("TOPPADDING", (0, 0), (-1, 0), 6),
    ]))
    elements.append(tbl)
    elements.append(Spacer(1, 12))

    # Subtotales por categoría
    sub_data = [["Subtotales por categoría", ""]]
    for cat, total in sorted(cats_subtotal.items()):
        sub_data.append([cat, f"${total:.2f}"])
    sub_data.append(["TOTAL GENERAL", f"${total_general:.2f}"])
    sub_tbl = Table(sub_data, colWidths=[120 * mm, 40 * mm])
    sub_tbl.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), brand_accent),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("BACKGROUND", (0, -1), (-1, -1), brand_dark),
        ("TEXTCOLOR", (0, -1), (-1, -1), colors.white),
        ("FONTNAME", (0, -1), (-1, -1), "Helvetica-Bold"),
        ("ALIGN", (1, 0), (1, -1), "RIGHT"),
        ("FONTSIZE", (0, 0), (-1, -1), 9),
        ("GRID", (0, 0), (-1, -1), 0.25, colors.HexColor("#e5e7eb")),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
        ("TOPPADDING", (0, 0), (-1, -1), 6),
    ]))
    elements.append(sub_tbl)
    elements.append(Spacer(1, 24))

    # Firma
    firma_data = [
        ["Asesor:", cfg.get("asesor", "_______________________")],
        ["Fecha:", datetime.now().strftime("%d/%m/%Y")],
        ["Firma:", "_______________________"],
    ]
    firma_tbl = Table(firma_data, colWidths=[30 * mm, 100 * mm])
    firma_tbl.setStyle(TableStyle([("FONTSIZE", (0, 0), (-1, -1), 9), ("TEXTCOLOR", (0, 0), (0, -1), brand_dark), ("FONTNAME", (0, 0), (0, -1), "Helvetica-Bold")]))
    elements.append(firma_tbl)

    doc.build(elements)
    buf.seek(0)
    fname = f"pedido_AJVJ_{payload.fecha_inicio}_{payload.fecha_fin}.pdf"
    return StreamingResponse(buf, media_type="application/pdf", headers={"Content-Disposition": f'attachment; filename="{fname}"'})

# ---------- Dashboard ----------
@api.get("/dashboard/stats")
async def dashboard_stats(
    fecha_inicio: Optional[str] = None,
    fecha_fin: Optional[str] = None,
    ciclo_numero: Optional[int] = None,
    _: dict = Depends(get_current_user),
):
    q: dict = {}
    if fecha_inicio or fecha_fin:
        q["fecha"] = {}
        if fecha_inicio:
            q["fecha"]["$gte"] = fecha_inicio
        if fecha_fin:
            q["fecha"]["$lte"] = fecha_fin
    if ciclo_numero is not None:
        q["ciclo_numero"] = ciclo_numero
    bitacoras = await db.bitacoras.find(q, {"_id": 0}).to_list(5000)
    modulos = {m["id"]: m for m in await db.modulos.find({}, {"_id": 0}).to_list(100)}
    productos_cat = {p["id"]: p for p in await db.productos.find({}, {"_id": 0}).to_list(2000)}
    inventario = await db.inventario.find({}, {"_id": 0}).to_list(2000)

    # 1. Costo por módulo
    costo_modulo: dict = {}
    # 2. Costo por objetivo
    costo_obj: dict = {}
    # 3. Costo por cultivo
    costo_cultivo: dict = {}
    # 4. Tipo (foliar/suelo/drench/riego)
    costo_tipo: dict = {"foliar": 0, "suelo": 0, "drench": 0, "riego": 0}
    # 5. Gasto por mes
    costo_mes: dict = {}
    # 6. Top productos por cantidad y costo
    top_qty: dict = {}
    top_cost: dict = {}

    aplicaciones_count = 0
    total_gastado = 0.0

    for b in bitacoras:
        m = modulos.get(b["modulo_id"], {})
        nombre_mod = m.get("nombre", "?")
        ciclo_obj = next((c for c in m.get("ciclos", []) if c.get("numero") == b.get("ciclo_numero")), None)
        cultivo = (ciclo_obj.get("cultivo") if ciclo_obj else "Sin asignar") or "Sin asignar"
        mes = (b.get("fecha") or "")[:7]  # YYYY-MM
        for ap in b.get("aplicaciones", []):
            aplicaciones_count += 1
            ap_total = ap.get("costo_total_aplicacion", 0)
            costo_modulo[nombre_mod] = costo_modulo.get(nombre_mod, 0) + ap_total
            costo_obj[ap.get("objetivo", "Sin objetivo")] = costo_obj.get(ap.get("objetivo", "Sin objetivo"), 0) + ap_total
            costo_cultivo[cultivo] = costo_cultivo.get(cultivo, 0) + ap_total
            costo_tipo[ap.get("tipo", "foliar")] = costo_tipo.get(ap.get("tipo", "foliar"), 0) + ap_total
            costo_mes[mes] = costo_mes.get(mes, 0) + ap_total
            total_gastado += ap_total
            for p in ap.get("productos", []):
                top_qty[p["nombre"]] = top_qty.get(p["nombre"], 0) + float(p.get("cantidad_usada_total", 0))
                top_cost[p["nombre"]] = top_cost.get(p["nombre"], 0) + float(p.get("costo_linea", 0))

    valor_inventario = 0.0
    inv_rows = []
    for inv in inventario:
        cat = productos_cat.get(inv["producto_id"], {})
        precio = cat.get("precio_unitario", 0) or 0
        valor = float(inv.get("cantidad", 0)) * precio
        valor_inventario += valor
        inv_rows.append({
            "producto_id": inv["producto_id"], "nombre": inv["nombre"],
            "cantidad": inv.get("cantidad", 0), "unidad": inv.get("unidad", ""),
            "precio_unitario": precio, "valor": round(valor, 2),
            "categoria": cat.get("categoria", ""),
        })
    inv_rows.sort(key=lambda x: x["valor"], reverse=True)

    def to_list(d):
        return [{"name": k, "value": round(v, 2)} for k, v in d.items()]

    top10_qty = sorted(top_qty.items(), key=lambda x: x[1], reverse=True)[:10]
    top10_cost = sorted(top_cost.items(), key=lambda x: x[1], reverse=True)[:10]

    return {
        "kpis": {
            "total_gastado": round(total_gastado, 2),
            "aplicaciones_registradas": aplicaciones_count,
            "productos_catalogo": len(productos_cat),
            "valor_inventario": round(valor_inventario, 2),
        },
        "costo_por_modulo": to_list(costo_modulo),
        "costo_por_objetivo": sorted(to_list(costo_obj), key=lambda x: x["value"], reverse=True),
        "costo_por_cultivo": to_list(costo_cultivo),
        "costo_por_tipo": to_list(costo_tipo),
        "costo_por_mes": sorted(to_list(costo_mes), key=lambda x: x["name"]),
        "top_productos_cantidad": [{"name": k, "value": round(v, 2)} for k, v in top10_qty],
        "top_productos_costo": [{"name": k, "value": round(v, 2)} for k, v in top10_cost],
        "inventario_valorizado": inv_rows,
    }

# ---------- Health ----------
@api.get("/")
async def root():
    return {"message": "AJVJ Fitosanidad API", "ok": True}

# ---------- Startup ----------
@app.on_event("startup")
async def startup():
    # Indexes
    await db.users.create_index("email", unique=True)
    await db.modulos.create_index("nombre", unique=True)
    await db.productos.create_index("nombre")
    await db.bitacoras.create_index("fecha")
    await db.bitacoras.create_index("modulo_id")
    await db.inventario.create_index("producto_id", unique=True)
    await db.movimientos.create_index("producto_id")
    await db.movimientos.create_index("referencia")

    # Seed admin
    admin_email = os.environ.get("ADMIN_EMAIL", "admin@ajvj.com").lower()
    admin_password = os.environ.get("ADMIN_PASSWORD", "admin123")
    existing = await db.users.find_one({"email": admin_email})
    if not existing:
        await db.users.insert_one({
            "id": new_id(),
            "email": admin_email,
            "password_hash": hash_password(admin_password),
            "nombre": "Administrador",
            "rol": "admin",
            "creado_en": now_iso(),
        })
        logger.info(f"Admin seeded: {admin_email}")
    elif not verify_password(admin_password, existing["password_hash"]):
        await db.users.update_one(
            {"email": admin_email},
            {"$set": {"password_hash": hash_password(admin_password)}},
        )
        logger.info(f"Admin password updated: {admin_email}")

@app.on_event("shutdown")
async def shutdown():
    client.close()

# Mount router
app.include_router(api)

app.add_middleware(
    CORSMiddleware,
    allow_origins=os.environ.get("CORS_ORIGINS", "*").split(","),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
