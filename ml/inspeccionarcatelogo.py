"""
generar_tech_catalog.py

Genera tech-catalog.json a partir de product_map.pkl,
agrupando por ecosistema (cat) y asignando vendor por heurística de prefijos.

Estructura de salida:
{
  "catalog": [
    {"cat": "database", "vendor": "Oracle", "products": ["mysql_server", ...]},
    {"cat": "database", "vendor": "Unknown", "products": [...]},
    ...
  ]
}
"""

import joblib
import json
import re

product_map = joblib.load("models/product_map.pkl")

# Excluimos ecosistemas demasiado ruidosos/genéricos
# EXCLUDE_ECOSYSTEMS = {"firmware_iot", "other_software"}
EXCLUDE_ECOSYSTEMS = set()

# Heurísticas: lista de (regex sobre la clave, vendor asignado)
# Se evalúan en orden; la primera que matchea gana.
VENDOR_RULES = [
    (r"^(windows|office|exchange|sql_server|iis|azure|edge|edge_chromium|visual_studio|\.net|internet_explorer)", "Microsoft"),
    (r"^(mac_os|macos|ios|ipad|iphone|tvos|watchos|safari)", "Apple"),
    (r"^(android|harmonyos|openharmony|emui)", "Google / Huawei"),
    (r"^(debian)", "Debian"),
    (r"^(enterprise_linux|rhel|hci_)", "Red Hat"),
    (r"^(mysql|mysql_server|mysql_enterprise_monitor|oracle|db2|db2_universal_database)", "Oracle / IBM"),
    (r"^(postgresql)", "PostgreSQL Global Development Group"),
    (r"^(mongodb)", "MongoDB Inc."),
    (r"^(mariadb)", "MariaDB Foundation"),
    (r"^(redis)", "Redis Ltd."),
    (r"^(chrome|chrome_os|android)", "Google"),
    (r"^(firefox)", "Mozilla"),
    (r"^(opera)", "Opera"),
    (r"^(wordpress)", "Automattic"),
    (r"^(joomla)", "Joomla!"),
    (r"^(drupal)", "Drupal"),
    (r"^(magento|experience_manager|acrobat|air_sdk|air_desktop|flash_player|coldfusion|adobe)", "Adobe"),
    (r"^(moodle)", "Moodle"),
    (r"^(prestashop)", "PrestaShop"),
    (r"^(docker)", "Docker Inc."),
    (r"^(kubernetes)", "CNCF / Kubernetes"),
    (r"^(jenkins)", "Jenkins / CloudBees"),
    (r"^(gitlab)", "GitLab Inc."),
    (r"^(git$)", "Git"),
    (r"^(ansible)", "Red Hat (Ansible)"),
    (r"^(jira|confluence)", "Atlassian"),
    (r"^(openshift)", "Red Hat (OpenShift)"),
    (r"^(jdk|jre|openjdk|graalvm)", "Oracle / OpenJDK"),
    (r"^(node\.js)", "OpenJS Foundation"),
    (r"^(esx|esxi|vcenter|vm_virtualbox|vmware)", "VMware"),
    (r"^(xen)", "Citrix / Xen Project"),
    (r"^(http_server|tomcat|jetty)", "Apache Foundation"),
    (r"^(weblogic|jboss)", "Oracle / Red Hat"),
    (r"^(arubaos)", "Aruba (HPE)"),
    (r"^(routeros)", "MikroTik"),
    (r"^(cisco|ios_xe|ios_xr|integrated_services_router|adaptive_security_appliance|anyconnect)", "Cisco"),
    (r"^(big-ip|f5)", "F5 Networks"),
    (r"^(fortios|fortigate|fortisandbox)", "Fortinet"),
    (r"^(palo_alto|pan-os)", "Palo Alto Networks"),
    (r"^(netbackup|storagegrid|santricity|netapp)", "NetApp"),
    (r"^(tivoli|clamav)", "IBM"),
    (r"^(dovecot)", "Dovecot"),
    (r"^(zimbra)", "Zimbra"),
    (r"^(mailman|squirrelmail)", "Open Source"),
    (r"^(ffmpeg)", "FFmpeg"),
    (r"^(vlc_media_player)", "VideoLAN"),
    (r"^(gimp)", "GIMP"),
    (r"^(imagemagick)", "ImageMagick"),
    (r"^(wireshark)", "Wireshark Foundation"),
    (r"^(libreoffice)", "The Document Foundation"),
    (r"^(openoffice)", "Apache OpenOffice"),
    (r"^(intellij)", "JetBrains"),
    (r"^(hp-ux)", "Hewlett Packard Enterprise"),
]


def assign_vendor(product_key: str) -> str:
    for pattern, vendor in VENDOR_RULES:
        if re.match(pattern, product_key, re.IGNORECASE):
            return vendor
    return "Unknown"


def main():
    # Agrupar: ecosistema -> vendor -> [productos]
    grouped = {}
    for key, ecosystem in product_map.items():
        if ecosystem in EXCLUDE_ECOSYSTEMS:
            continue
        vendor = assign_vendor(key)
        grouped.setdefault(ecosystem, {}).setdefault(vendor, []).append(key)

    catalog = []
    for ecosystem in sorted(grouped.keys()):
        for vendor in sorted(grouped[ecosystem].keys()):
            products = sorted(grouped[ecosystem][vendor])
            catalog.append({
                "cat": ecosystem,
                "vendor": vendor,
                "products": products
            })

    output = {
        "_comment": "Catalogo de tecnologias generado automaticamente desde product_map.pkl. cat = ecosistema del modelo, vendor = heuristica por prefijo, products = claves crudas (compatibles con product_map).",
        "catalog": catalog
    }

    with open("tech-catalog.json", "w", encoding="utf-8") as f:
        json.dump(output, f, indent=2, ensure_ascii=False)

    print(f"Generado tech-catalog.json con {len(catalog)} grupos (cat+vendor).")


if __name__ == "__main__":
    main()


# # inspeccionar_catalogo.py
# import joblib
# import json

# vendor_map  = joblib.load("models/vendor_map.pkl")
# product_map = joblib.load("models/product_map.pkl")

# print("===== VENDORS CONOCIDOS =====")
# print(json.dumps(list(vendor_map.keys()), indent=2, ensure_ascii=False))

# print("\n===== PRODUCTOS CONOCIDOS =====")
# print(json.dumps(list(product_map.keys()), indent=2, ensure_ascii=False))





# # agrupar_productos.py
# import joblib
# import json

# product_map = joblib.load("models/product_map.pkl")

# # Agrupar claves originales por su ecosistema (valor)
# grupos = {}
# for key, value in product_map.items():
#     grupos.setdefault(value, []).append(key)

# print("===== CONTEO POR ECOSISTEMA =====")
# for eco, items in sorted(grupos.items()):
#     print(f"{eco}: {len(items)} productos")

# print("\n===== MUESTRA DE 15 POR ECOSISTEMA =====")
# for eco, items in sorted(grupos.items()):
#     print(f"\n--- {eco} ---")
#     print(json.dumps(sorted(items)[:15], indent=2, ensure_ascii=False))




# # inspeccionar_estructura.py
# import joblib
# import json

# vendor_map  = joblib.load("models/vendor_map.pkl")
# product_map = joblib.load("models/product_map.pkl")

# print("===== TIPO DE DATOS =====")
# print("vendor_map type:", type(vendor_map))
# print("product_map type:", type(product_map))

# print("\n===== MUESTRA VENDOR_MAP (10 items) =====")
# for i, (k, v) in enumerate(vendor_map.items()):
#     print(f"  {repr(k)} -> {repr(v)}")
#     if i >= 9:
#         break

# print("\n===== MUESTRA PRODUCT_MAP (15 items) =====")
# for i, (k, v) in enumerate(product_map.items()):
#     print(f"  {repr(k)} -> {repr(v)}")
#     if i >= 14:
#         break

# print("\n===== VALORES ÚNICOS DE vendor_map (grupos finales) =====")
# unique_vendor_groups = sorted(set(vendor_map.values()))
# print(f"Total grupos únicos de vendor: {len(unique_vendor_groups)}")
# print(json.dumps(unique_vendor_groups[:30], indent=2, ensure_ascii=False))

# print("\n===== VALORES ÚNICOS DE product_map (grupos finales) =====")
# unique_product_groups = sorted(set(product_map.values()))
# print(f"Total grupos únicos de producto: {len(unique_product_groups)}")
# print(json.dumps(unique_product_groups[:30], indent=2, ensure_ascii=False))


# print(f"\nTotal vendors: {len(vendor_map)}")
# print(f"Total productos: {len(product_map)}")
# print(f"Total clases : {len(product_map)}")






