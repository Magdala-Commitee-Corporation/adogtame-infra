# adogtame-infra

Infraestructura base de Adogtame (I0.3, ADO-13), desplegada con SST v4.

- **CloudFront (`Router`)** con dominio propio por stage. Sirve la aplicación web (`/`), las fotos (`/fotos`) y enruta `/api/<servicio>` a la API HTTP de cada microservicio.
- **WAF** definido pero **desactivado** por costo (`ENABLE_WAF` en `sst.config.ts`). Al activarlo, aplica solo a `prod`: bloquea con 429 las IP que superan 500 peticiones en 5 minutos, más las reglas administradas de AWS (Core, Known Bad Inputs y SQLi).
- **Temas SNS** de eventos de `Auth`, `Dogs` y `Requests`. Sus ARN se publican en SSM (`/adogtame/<stage>/topics/<servicio>-events-arn`) y cada microservicio suscribe su cola.
- El bucket borra a las 24 horas lo que quede bajo `tmp/` (fotos temporales).
- **Bucket de fotos** privado, accesible solo desde CloudFront.
- Publica en SSM el ID de la distribución y el nombre del bucket (`/adogtame/<stage>/...`) para los demás repos.

Decisiones: [`adog_ARCH.md`](https://github.com/Magdala-Commitee-Corporation/adogtame-docs/blob/main/agent/instruments/adog_ARCH.md).

## Ambientes

| Stage | Dominio | WAF |
|---|---|---|
| `dev` | https://dev.adogtame.vieerr.xyz | No |
| `prod` | https://adogtame.vieerr.xyz | Desactivado |

## Uso

Desplegar primero este repo y luego `adogtame-web` y los microservicios.

```bash
npm install
npm run deploy:dev
npm run deploy:prod
```

Requiere el perfil de AWS `bier-personal`.
