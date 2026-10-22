# Despliegue en Oracle Cloud (Always Free)

La API (Flask + modelo) corre 24/7 en un servidor gratuito de Oracle y se publica
con el **mismo túnel ngrok** que usas en tu PC: la web y el agente no cambian.
El servidor no abre ningún puerto a internet (solo SSH).

| Pieza | Valor |
|---|---|
| Servidor | VM.Standard.A1.Flex (ARM) · 2 OCPU · 12 GB RAM · Ubuntu 24.04 · disco 100 GB |
| Región | Colombia Central (Bogotá) |
| Servicios | `cyberrisk-api` (gunicorn en 127.0.0.1:5000) y `cyberrisk-tunel` (ngrok) |

## 1. Llave SSH (en tu PC, una vez)
```powershell
ssh-keygen -t ed25519 -f $HOME\.ssh\oracle_cyberrisk
```
(Enter para dejar sin contraseña). Se crean `oracle_cyberrisk` (privada, no compartir) y `oracle_cyberrisk.pub` (pública).

## 2. Crear el servidor (consola de Oracle)
Compute → Instances → Create instance:
- **Image:** Canonical Ubuntu 24.04 · **Shape:** Ampere → VM.Standard.A1.Flex → 2 OCPU, 12 GB
- **Networking:** VCN y subred pública nuevas · asignar IPv4 pública
- **SSH keys:** pegar el contenido de `oracle_cyberrisk.pub`
- **Boot volume:** 100 GB
Si sale *Out of host capacity*, reintentar más tarde.

## 3. Instalar (en el servidor)
```powershell
ssh -i $HOME\.ssh\oracle_cyberrisk ubuntu@IP_PUBLICA
```
```bash
git clone https://github.com/Oscar98farfan/CyberRiskIntelligencePlatform.git
bash CyberRiskIntelligencePlatform/deploy/oracle/instalar.sh
ngrok config add-authtoken TU_TOKEN
```

## 4. Subir .env y modelos (en tu PC, carpeta Wiki)
```powershell
powershell -ExecutionPolicy Bypass -File .\deploy\oracle\subir_archivos.ps1 -IP IP_PUBLICA
```

## 5. Encender (en el servidor)
Detén primero `iniciar_servidor.ps1` en tu PC (ngrok solo permite un túnel por dominio).
```bash
sudo systemctl start cyberrisk-api cyberrisk-tunel
journalctl -u cyberrisk-api -f      # ver cómo cargan los modelos (Ctrl+C para salir)
```

## Día a día
- Actualizar tras un `git push`: `bash ~/CyberRiskIntelligencePlatform/deploy/oracle/actualizar.sh`
- Estado: `systemctl status cyberrisk-api cyberrisk-tunel`
- Reiniciar: `sudo systemctl restart cyberrisk-api`

## Costo $0
Mantén la cuenta en **Free Tier** (no la pases a *Pay As You Go*) y usa solo recursos
marcados *Always Free*. Oracle puede recuperar servidores gratis inactivos 7 días
(CPU, red y memoria < 20 %); con el modelo cargado la memoria se mantiene por encima.
