# adogtame-infra

Infraestructura base de Adogtame (I0.3, ADO-13), desplegada con SST v4.

- **CloudFront (`Router`)** con dominio propio por stage. Sirve la aplicación web (`/`), las fotos (`/fotos`) y enruta `/api/<servicio>` a la API HTTP de cada microservicio.
- **WAF** definido pero **desactivado** por costo (`ENABLE_WAF` en `sst.config.ts`). Al activarlo, aplica solo a `prod`: bloquea con 429 las IP que superan 500 peticiones en 5 minutos, más las reglas administradas de AWS (Core, Known Bad Inputs y SQLi).
- **Temas SNS** de eventos de `Auth`, `Dogs` y `Requests`. Sus ARN se publican en SSM (`/adogtame/<stage>/topics/<servicio>-events-arn`) y cada microservicio suscribe su cola.
- El bucket borra a las 24 horas lo que quede bajo `tmp/` (fotos temporales).
- **Bucket de fotos** privado, accesible solo desde CloudFront.
- Publica en SSM el ID de la distribución y el nombre del bucket (`/adogtame/<stage>/...`) para los demás repos.
- **Aurora Serverless v2 (PostgreSQL)**, solo en las etapas de `DATABASE_STAGES` (hoy `dev`). Un cluster con una base por servicio (`auth`, `dogs`), capacidad mínima de 0 ACU y pausa a los 5 minutos sin conexiones: en reposo solo cuesta el almacenamiento y el secreto (USD 0,40). Usa la VPC por defecto de la cuenta con un grupo de seguridad sin reglas de entrada; las funciones entran por la Data API. Publica en SSM `/adogtame/<stage>/db/cluster-id`, `cluster-arn` y `secret-arn`.

Decisiones: [`adog_ARCH.md`](https://github.com/Magdala-Commitee-Corporation/adogtame-docs/blob/main/agent/instruments/adog_ARCH.md).

## Ambientes

| Stage | Dominio | WAF | Aurora |
|---|---|---|---|
| `dev` | https://dev.adogtame.vieerr.xyz | No | Sí (0 ACU) |
| `prod` | https://adogtame.vieerr.xyz | Desactivado | No, hasta que se necesite |

## Uso

Desplegar primero este repo y luego `adogtame-web` y los microservicios.

```bash
npm install
npm run deploy:dev
npm run deploy:prod
npm run db:bootstrap -- dev   # crea las bases auth y dogs (se puede repetir)
```

Después de crear el cluster, cada microservicio crea sus tablas con `npm run db:migrate` y `npm run db:seed` en su repositorio.

### Apagar o regenerar la base

- **Apagar:** quitar la etapa de `DATABASE_STAGES` y desplegar. Se borra el cluster con sus datos; el costo queda en 0.
- **Regenerar:** volver a agregarla, desplegar, correr `db:bootstrap` y las migraciones y el *seed* de cada servicio.

## Ramas

`main` (producción), `dev` (integración) y `testing` (pruebas).

Requiere el perfil de AWS `bier-personal`.
