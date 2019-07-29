// @ts-check

/**
 * @typedef {object} Atmosphere
 * @property {number} nitrogen
 * @property {number} oxygen
 * @property {number} carbonDioxide
 * @property {number} methane
 * @property {number} waterVapour
 */

/**
 * @typedef {object} Tile
 * @property {number} altitude
 * @property {number} baseLuminosity
 * @property {number} temperature
 * @property {TileCover} tileCover
 */

/**
 * @typedef {object} World
 * @property {Atmosphere} atmosphere
 * @property {Tile[][]} tiles
 * @property {() => void} draw
 * @property {() => void} tick
 * @property {() => void} updateStats
 */

/**@enum {number} */
const TileCover = {
    NotComputed: 0,
    Rock: 1,
    Water: 2,
    Ice: 3,
}


const worldWidth = 100
const worldHeight = 100

const maxAltitude = 5000
const erosionRate = 4
const atmosphereLossRate = 0.01
const atmospherePerTile = 1 / (worldHeight * worldWidth)

const seaLevel = 1000
const freezingPoint = 120

const volcanoDiameter = 9
const volcanoHalfDiameter = Math.floor(volcanoDiameter / 2)
const volcanoMinUpthrust = 1000
const volcanoUpthrustVariation = 1000
const volcanoMinCarbonOutput = 500
const volcanoCarbonOutputVariation = 500

const tempRepresentationOffset = -120
const fullLuminosityHeat = 130
const polarLuminosity = 0.5
const iceReflectivity = 0.4
const waterReflectivity = 0.1

// retention value is per unit
const carbonHeatRetention = 0.06

const canvas = document.createElement('canvas')
document.body.appendChild(canvas)
canvas.width = 1000
canvas.height = 1000
const tileSize = 10
const context = canvas.getContext('2d')

/**
 * @param {number} size 
 * @returns {object[]}
 */
function List(size) {
    const result = []
    result.length = size
    return result.fill(undefined)
}

function getRandomX() {
    return Math.floor(Math.random() * worldWidth)
}

function getRandomY() {
    return Math.floor(Math.random() * worldHeight)
}

/**
 * @param {number} r 
 * @param {number} g 
 * @param {number} b 
 * @returns {string}
 */
function rgb(r, g, b) {
    r = Math.floor(r * 256)
    g = Math.floor(g * 256)
    b = Math.floor(b * 256)
    return 'rgb(' + r + ',' + g + ',' + b + ')'
}

/**
 * @param {number} h
 * @param {number} s
 * @param {number} l
 * @returns {string}
 */
function hsl(h, s, l) {
    s = Math.round(s * 100)
    l = Math.round(l * 100)
    return 'hsl(' + h + ',' + s + '%,' + l + '%)'
}

/** @returns {World} */
function World() {
    const atmosphere = Atmosphere()
    const tiles = Tiles()

    /**@param {(x: number, y: number, tile: Tile) => void} func */
    const applyTiles = function(func) {
        tiles.forEach(function(val, x) {
            val.forEach(function(val, y) {
                func(x, y, val)
            })
        })
    }

    const draw = function() {
        applyTiles(function(x, y, tile) {
            if (tile.tileCover == TileCover.Rock) {
                context.fillStyle = hsl(21, 0.55, tile.altitude / maxAltitude)
            }
            else if (tile.tileCover == TileCover.Water) {
                context.fillStyle = hsl(233, 0.84, 0.45)
            }
            else if (tile.tileCover == TileCover.Ice) {
                context.fillStyle = hsl(0, 0, 1)
            }
            else {
                context.fillStyle = hsl(0, 0, 0)
            }

            context.fillRect(x * tileSize, y * tileSize, tileSize, tileSize)
        })
    }

    const eruptVolcano = function() {
        const baseX = getRandomX()
        const baseY = getRandomY()
        const upthrust = volcanoMinUpthrust + Math.floor(volcanoUpthrustVariation * Math.random())
        const spreadUpthrust = List(volcanoDiameter).map(function(val, x) {
            return List(volcanoDiameter).map(function(val, y) {
                const xDist = volcanoHalfDiameter - x
                const yDist = volcanoHalfDiameter - y
                const dist = Math.sqrt((xDist * xDist) + (yDist * yDist))
                return (Math.max((volcanoHalfDiameter - dist), 0) / volcanoHalfDiameter) * upthrust
            })
        })
        spreadUpthrust.forEach(function(val, xOffset) {
            val.forEach(function(val, yOffset) {
                const x = baseX + xOffset
                const y = baseY + yOffset
                if (x < worldWidth && y < worldHeight) {
                    const tile = tiles[baseX + xOffset][baseY + yOffset]
                    tile.altitude = Math.min(tile.altitude + val, maxAltitude)
                }
            })
        })
        atmosphere.carbonDioxide += volcanoMinCarbonOutput + Math.floor(Math.random() * volcanoCarbonOutputVariation)
    }

    /**
     * @returns {Atmosphere}
     */
    const computeTileAtmosphere = function() {
        return {
            nitrogen: atmosphere.nitrogen * atmospherePerTile,
            oxygen: atmosphere.oxygen * atmospherePerTile,
            carbonDioxide: atmosphere.carbonDioxide * atmospherePerTile,
            methane: atmosphere.methane * atmospherePerTile,
            waterVapour: atmosphere.waterVapour * atmospherePerTile,
        }
    }

    /**
     * @param {Atmosphere} atmosphere
     * @returns {number}
     */
    const computeHeatTrappingFactor = function(atmosphere) {
        return atmosphere.carbonDioxide * carbonHeatRetention
    }

    /**
     * @param {Tile} tile
     * @returns {number}
     */
    const computeLuminosity = function(tile) {
        if (tile.tileCover == TileCover.Water) {
            return tile.baseLuminosity * (1 - waterReflectivity)
        }
        else if (tile.tileCover == TileCover.Ice) {
            return tile.baseLuminosity * (1 - iceReflectivity)
        }
        else {
            return tile.baseLuminosity
        }
    }

    /**
     * @param {Tile} tile
     * @param {number} luminosity
     * @param {number} heatTrappingFactor
     * @returns {number}
     */
    const computeTemperature = function(tile, luminosity, heatTrappingFactor) {
        return fullLuminosityHeat * luminosity * (1 + heatTrappingFactor)
    }

    /**
     * @param {Tile} tile
     * @returns {TileCover}
     */
    const computeTileCover = function(tile) {
        if (tile.altitude < seaLevel) {
            if (tile.temperature > freezingPoint) {
                return TileCover.Water
            }
            else {
                return TileCover.Ice
            }
        }
        else {
            return TileCover.Rock
        }
    }

    const tick = function() {
        eruptVolcano()
        atmosphere.carbonDioxide -= atmosphere.carbonDioxide * atmosphereLossRate
        atmosphere.methane -= atmosphere.methane * atmosphereLossRate
        atmosphere.nitrogen -= atmosphere.nitrogen * atmosphereLossRate
        atmosphere.oxygen -= atmosphere.oxygen * atmosphereLossRate
        atmosphere.waterVapour -= atmosphere.waterVapour * atmosphereLossRate
        const tileAtmosphere = computeTileAtmosphere()
        const heatTrappingFactor = computeHeatTrappingFactor(tileAtmosphere)
        applyTiles(function(x, y, tile) {
            tile.altitude = Math.max(tile.altitude - erosionRate, 0)
            const luminosity = computeLuminosity(tile)
            tile.temperature = computeTemperature(tile, luminosity, heatTrappingFactor)
        })
        // transfer some heat between tiles
        applyTiles(function(x, y, tile) {
            const horizontalTile = tiles[(x + 1) % worldWidth][y]
            const horizontalAveTemp = (tile.temperature + horizontalTile.temperature) / 2
            horizontalTile.temperature = horizontalAveTemp

            const verticalTile = tiles[x][(y + 1) % worldHeight]
            const verticalAveTemp = (tile.temperature + verticalTile.temperature) / 2
            verticalTile.temperature = verticalAveTemp

            tile.temperature = (horizontalAveTemp + verticalAveTemp) / 2
        })
        applyTiles(function(x, y, tile) {
            tile.tileCover = computeTileCover(tile)
        })
    }

    const updateStats = function() {
        document.getElementById('co2').innerText = atmosphere.carbonDioxide.toString()
        document.getElementById('avetemp').innerText = (tiles[50].reduce(function(acc, tile) { return acc + tile.temperature }, 0) / worldHeight).toString()
        document.getElementById('eqtemp').innerText = (tiles.reduce(function(acc, cur) { return acc + cur[worldHeight / 2].temperature }, 0) / worldWidth).toString()
        document.getElementById('poltemp').innerText = (tiles.reduce(function(acc, cur) { return acc + cur[0].temperature }, 0) / worldHeight).toString()
    }

    return {
        atmosphere: atmosphere,
        tiles: tiles,
        draw: draw,
        tick: tick,
        updateStats: updateStats,
    }
}

/** @returns {Atmosphere} */
function Atmosphere() {
    return {
        nitrogen: 0,
        oxygen: 0,
        carbonDioxide: 0,
        methane: 0,
        waterVapour: 0,
    }
}

/** @returns {Tile[][]} */
function Tiles() {
    return List(worldWidth).map(function(val, x) {
        return List(worldHeight).map(function(val, y) {
            return Tile(x, y)
        })
    })
}

/**
 * @param {number} x
 * @param {number} y
 * @returns {Tile}
 */
function Tile(x, y) {
    const equatorialDistance = Math.abs(y - (worldHeight / 2)) / (worldHeight / 2)
    return {
        altitude: 0,
        baseLuminosity: 1 - ((1 - polarLuminosity) * equatorialDistance),
        temperature: 0,
        tileCover: TileCover.NotComputed,
    }
}

const w = World()
w.draw()
setInterval(function() {
    w.tick()
    w.draw()
    w.updateStats()
}, 100)
