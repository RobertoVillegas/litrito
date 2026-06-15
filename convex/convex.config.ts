import { defineApp } from 'convex/server'
import betterAuth from '@convex-dev/better-auth/convex.config'
import geospatial from '@convex-dev/geospatial/convex.config'

const app = defineApp()

app.use(betterAuth)
app.use(geospatial)

export default app
