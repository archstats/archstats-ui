/** @type {import('tailwindcss').Config} */
module.exports = {
    content: [
        "./index.html",
        "./src/**/*.{vue,js,ts,jsx,tsx}",
    ],
    theme: {
        container: {
            padding: '2rem',
            center: true,
        },
        extend: {
            colors: {
                'archstats': {
                    50: '#bbc4dd',
                    100: '#aeb8d6',
                    200: '#92a0c8',
                    300: '#8594c1',
                    400: '#6a7bc4',
                    500: '#5266a3',
                    600: '#4b5e95',
                    700: '#445588',
                    800: '#37446d',
                    900: '#27314e',
                },
                'tertiary': {
                    50: '#c3cdea',
                    100: '#b4c1e4',
                    200: '#a4b4df',
                    300: '#778fcf',
                    400: '#5976c5',
                    500: '#3d5bae',
                    600: '#3a57a6',
                    700: '#354f97',
                    800: '#304788',
                    900: '#2a3f79'
                },
                'secondary': {
                    50: '#ffd699',
                    100: '#ffce85',
                    200: '#ffc670',
                    300: '#ffbe5c',
                    400: '#f59300',
                    500: '#dc8400',
                    600: '#cc7a00',
                    700: '#b86e00',
                    800: '#a36200',
                    900: '#8f5600',
                },

                'white': '#fbfeff',
            }
        },
    },
    plugins: [],
}
