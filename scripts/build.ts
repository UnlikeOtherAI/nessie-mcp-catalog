import { project, writeProjection } from '../src/project.ts'
const projection = await project()
await writeProjection(projection)
console.log(JSON.stringify(projection.report))
